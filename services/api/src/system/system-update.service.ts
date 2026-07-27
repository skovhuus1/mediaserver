import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

type UpdateProcessResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

type UpdateCheckResult = {
  enabled: boolean;
  configured: boolean;
  repoPath: string;
  remote: string;
  branch: string;
  localCommit: string | null;
  remoteCommit: string | null;
  hasUpdate: boolean;
  reason?: string;
};

type UpdateApplyResult = UpdateCheckResult & {
  fetchOutput: string;
  pullOutput: string;
  restartOutput: string;
  restartMode: string;
  restarted: boolean;
};

type RestartOutcome = {
  restarted: boolean;
  mode: string;
  output: string;
};

type RestartMode = 'docker-compose' | 'systemctl' | 'none';

const execFileAsync = promisify(execFile);

@Injectable()
export class SystemUpdateService {
  private readonly enabled = this.toBoolean(process.env.BB_MEDIA_UPDATE_ENABLED, false);
  private readonly repoPath = process.env.BB_MEDIA_UPDATE_REPO_PATH ?? process.cwd();
  private readonly gitRemote = process.env.BB_MEDIA_UPDATE_GIT_REMOTE ?? 'origin';
  private readonly gitBranch = process.env.BB_MEDIA_UPDATE_GIT_BRANCH ?? 'main';
  private readonly composeFile = process.env.BB_MEDIA_COMPOSE_FILE ?? 'docker-compose.yml';
  private readonly autoRestart = this.toBoolean(process.env.BB_MEDIA_UPDATE_AUTO_RESTART, true);
  private readonly restartMode: RestartMode;
  private readonly systemctlService = process.env.BB_MEDIA_SYSTEMD_SERVICE;
  private readonly systemctlUseSudo = this.toBoolean(process.env.BB_MEDIA_SYSTEMD_USE_SUDO, false);

  constructor() {
    this.restartMode = this.normalizeRestartMode(process.env.BB_MEDIA_UPDATE_RESTART_MODE);
  }

  private async runCommand(cmd: string, args: string[], cwd: string, timeoutMs = 60_000): Promise<UpdateProcessResult> {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 4,
      });

      return {
        command: `${cmd} ${args.join(' ')}`,
        exitCode: 0,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
      };
    } catch (error: any) {
      return {
        command: `${cmd} ${args.join(' ')}`,
        exitCode: Number(error?.code) || 1,
        stdout: String(error?.stdout ?? '').trim(),
        stderr: String(error?.stderr ?? this.formatCommandError(error)).trim(),
      };
    }
  }

  private async runCommandRequired(
    cmd: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    step: string,
  ): Promise<UpdateProcessResult> {
    const result = await this.runCommand(cmd, args, cwd, timeoutMs);
    if (result.exitCode !== 0) {
      throw new InternalServerErrorException({
        code: 'command_failed',
        message: `${step} failed`,
        command: result.command,
        exitCode: result.exitCode,
        details: result.stderr || result.stdout,
      });
    }

    return result;
  }

  async checkForUpdate(): Promise<UpdateCheckResult> {
    const status = this.getBaseStatus();
    if (!status.configured) {
      return status;
    }

    const remoteCheck = await this.runCommand('git', ['remote', 'get-url', this.gitRemote], this.repoPath, 10_000);
    if (remoteCheck.exitCode !== 0) {
      return {
        ...status,
        configured: false,
        reason: `Git remote '${this.gitRemote}' is missing or unreachable.`,
      };
    }

    const fetchResult = await this.runCommand('git', ['fetch', '--prune', this.gitRemote, this.gitBranch], this.repoPath, 45_000);
    if (fetchResult.exitCode !== 0) {
      return {
        ...status,
        localCommit: null,
        remoteCommit: null,
        hasUpdate: false,
        reason: `Unable to fetch remote branch ${this.gitBranch}: ${fetchResult.stderr || fetchResult.stdout}`,
      };
    }

    const localCommit = await this.getRefCommit('HEAD');
    const remoteCommit = await this.getRefCommit(`${this.gitRemote}/${this.gitBranch}`);

    if (!localCommit || !remoteCommit) {
      return {
        ...status,
        localCommit,
        remoteCommit,
        hasUpdate: false,
        reason: 'Unable to resolve local or remote commit hash.',
      };
    }

    return {
      ...status,
      localCommit,
      remoteCommit,
      hasUpdate: localCommit !== remoteCommit,
    };
  }

  async applyUpdate(): Promise<UpdateApplyResult> {
    if (!this.enabled) {
      throw new BadRequestException({
        code: 'update_disabled',
        message: 'Update is disabled by configuration.',
      });
    }

    const baseline = await this.checkForUpdate();
    if (!baseline.configured) {
      throw new BadRequestException({
        code: 'update_not_configured',
        message: baseline.reason ?? 'Update service is not configured.',
      });
    }

    if (!baseline.hasUpdate) {
      return {
        ...baseline,
        fetchOutput: 'No update required. Local branch is up to date.',
        pullOutput: 'No update required. Local branch is up to date.',
        restartMode: this.restartMode,
        restartOutput: 'No update required. No restart performed.',
        restarted: false,
      };
    }

    const dirtyCheck = await this.runCommandRequired(
      'git',
      ['status', '--short', '--untracked-files=no'],
      this.repoPath,
      15_000,
      'Working tree check',
    );

    if (dirtyCheck.stdout) {
      throw new BadRequestException({
        code: 'update_blocked',
        message: 'Working tree is not clean. Commit or stash local changes before applying update.',
      });
    }

    const fetchResult = await this.runCommandRequired(
      'git',
      ['fetch', '--prune', this.gitRemote, this.gitBranch],
      this.repoPath,
      45_000,
      'Remote fetch',
    );
    const pullResult = await this.runCommandRequired(
      'git',
      ['pull', '--ff-only', this.gitRemote, this.gitBranch],
      this.repoPath,
      120_000,
      'Pull',
    );

    const updatedStatus = await this.checkForUpdate();
    const restart = await this.restartStackIfNeeded(updatedStatus.hasUpdate);

    return {
      ...updatedStatus,
      fetchOutput: fetchResult.stdout,
      pullOutput: pullResult.stdout,
      restartMode: restart.mode,
      restartOutput: restart.output,
      restarted: restart.restarted,
    };
  }

  private async restartStackIfNeeded(hasUpdate: boolean): Promise<RestartOutcome> {
    if (!hasUpdate) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: 'No new code found; restart was skipped.',
      };
    }

    if (!this.autoRestart) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: 'Auto restart is disabled (BB_MEDIA_UPDATE_AUTO_RESTART=false).',
      };
    }

    switch (this.restartMode) {
      case 'systemctl':
        return this.restartWithSystemctl();
      case 'docker-compose':
        return this.restartWithDockerCompose();
      case 'none':
      default:
        return {
          restarted: false,
          mode: this.restartMode,
          output: 'Restart mode is none. Update was pulled without server restart.',
        };
    }
  }

  private async restartWithSystemctl(): Promise<RestartOutcome> {
    if (!this.systemctlService) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: 'BB_MEDIA_SYSTEMD_SERVICE is not set. Update was pulled without restart.',
      };
    }

    const command = this.systemctlUseSudo ? 'sudo' : 'systemctl';
    const commandArgs = this.systemctlUseSudo ? ['systemctl', 'restart', this.systemctlService] : ['restart', this.systemctlService];

    const result = await this.runCommand(command, commandArgs, this.repoPath, 90_000);
    if (result.exitCode !== 0) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: `systemctl restart failed: ${result.stderr || result.stdout || 'unknown error'}`,
      };
    }

    return {
      restarted: true,
      mode: this.restartMode,
      output: `systemctl restart completed for ${this.systemctlService}`,
    };
  }

  private async restartWithDockerCompose(): Promise<RestartOutcome> {
    const absoluteComposePath = this.resolveComposePath(this.composeFile);
    if (!existsSync(absoluteComposePath)) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: `docker-compose file not found (${absoluteComposePath}); update was pulled but restart requires manual handling.`,
      };
    }

    const pullResult = await this.runCommand('docker', ['compose', '-f', absoluteComposePath, 'pull'], this.repoPath, 120_000);
    if (pullResult.exitCode !== 0) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: `docker compose pull failed: ${pullResult.stderr || pullResult.stdout || 'unknown error'}`,
      };
    }

    const upResult = await this.runCommand('docker', ['compose', '-f', absoluteComposePath, 'up', '--detach', '--remove-orphans'], this.repoPath, 180_000);
    if (upResult.exitCode !== 0) {
      return {
        restarted: false,
        mode: this.restartMode,
        output: `docker compose up failed: ${upResult.stderr || upResult.stdout || 'unknown error'}`,
      };
    }

    return {
      restarted: true,
      mode: this.restartMode,
      output: [pullResult.stdout, upResult.stdout].filter(Boolean).join('\n') || 'docker compose update completed',
    };
  }

  private getBaseStatus(): UpdateCheckResult {
    if (!this.enabled) {
      return {
        enabled: false,
        configured: false,
        repoPath: this.repoPath,
        remote: this.gitRemote,
        branch: this.gitBranch,
        localCommit: null,
        remoteCommit: null,
        hasUpdate: false,
        reason: 'BB_MEDIA_UPDATE_ENABLED is false.',
      };
    }

    if (!existsSync(this.repoPath)) {
      return {
        enabled: true,
        configured: false,
        repoPath: this.repoPath,
        remote: this.gitRemote,
        branch: this.gitBranch,
        localCommit: null,
        remoteCommit: null,
        hasUpdate: false,
        reason: `Repo path does not exist: ${this.repoPath}`,
      };
    }

    if (!existsSync(join(this.repoPath, '.git'))) {
      return {
        enabled: true,
        configured: false,
        repoPath: this.repoPath,
        remote: this.gitRemote,
        branch: this.gitBranch,
        localCommit: null,
        remoteCommit: null,
        hasUpdate: false,
        reason: `No .git directory in repo path: ${this.repoPath}`,
      };
    }

    return {
      enabled: true,
      configured: true,
      repoPath: this.repoPath,
      remote: this.gitRemote,
      branch: this.gitBranch,
      localCommit: null,
      remoteCommit: null,
      hasUpdate: false,
    };
  }

  private async getRefCommit(ref: string): Promise<string | null> {
    const result = await this.runCommand('git', ['rev-parse', ref], this.repoPath, 15_000);
    if (result.exitCode !== 0 || !result.stdout) {
      return null;
    }
    return result.stdout.trim();
  }

  private resolveComposePath(rawPath: string): string {
    if (isAbsolute(rawPath)) {
      return rawPath;
    }

    return join(this.repoPath, rawPath);
  }

  private normalizeRestartMode(raw: string | undefined): RestartMode {
    const value = (raw ?? 'docker-compose').toLowerCase();
    if (value === 'systemctl' || value === 'systemd') {
      return 'systemctl';
    }
    if (value === 'none' || value === 'off') {
      return 'none';
    }
    return 'docker-compose';
  }

  private toBoolean(value: string | undefined, fallback: boolean): boolean {
    if (typeof value === 'undefined') {
      return fallback;
    }

    const normalized = String(value).toLowerCase();
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
      return false;
    }

    return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
  }

  private formatCommandError(error: any): string {
    if (!error) {
      return 'Unknown failure';
    }

    if (typeof error === 'string') {
      return error;
    }

    return error?.message ?? error?.stderr ?? error?.stdout ?? 'Unexpected shell error';
  }
}
