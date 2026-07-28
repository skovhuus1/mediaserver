import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { classifyUpdateTransition, type UpdateTransition } from './update-transition';

const execFileAsync = promisify(execFile);
type RestartMode = 'none' | 'systemd' | 'docker-compose';

type CommandResult = {
  stdout: string;
  stderr: string;
};

@Injectable()
export class UpdaterService {
  private updateInProgress = false;
  private readonly enabled = parseBoolean(process.env.BB_MEDIA_UPDATE_ENABLED, false);
  private readonly repositoryPath = resolve(process.env.BB_MEDIA_UPDATE_REPO_PATH || process.cwd());
  private readonly remote = validateGitName(process.env.BB_MEDIA_UPDATE_REMOTE ?? 'origin', 'remote');
  private readonly defaultBranch = validateBranch(process.env.BB_MEDIA_UPDATE_BRANCH ?? 'main');
  private readonly restartMode = normalizeRestartMode(process.env.BB_MEDIA_UPDATE_RESTART_MODE);
  private readonly useSudo = parseBoolean(process.env.BB_MEDIA_UPDATE_USE_SUDO, false);

  constructor(private readonly prisma: PrismaService) {}

  async status(accountId: string) {
    const branch = await this.selectedBranch(accountId);
    const base = {
      enabled: this.enabled,
      configured: this.isConfigured(),
      repositoryPath: this.repositoryPath,
      remote: this.remote,
      branch,
      restartMode: this.restartMode,
      updateInProgress: this.updateInProgress,
    };
    if (!base.enabled || !base.configured) {
      return {
        ...base,
        localCommit: null,
        remoteCommit: null,
        currentBranch: null,
        dirty: false,
        hasUpdate: false,
        canApply: false,
        transitionMode: 'blocked',
        transitionReason: !base.enabled ? 'Updateren er deaktiveret.' : 'Git-worktree blev ikke fundet.',
        blockers: [!base.enabled ? 'Updateren er deaktiveret i Docker-konfigurationen.' : 'Git-worktree blev ikke fundet.'],
      };
    }
    const [local, remote, currentBranchResult, dirtyResult] = await Promise.all([
      this.run('git', ['rev-parse', 'HEAD']),
      this.run('git', ['ls-remote', this.remote, `refs/heads/${branch}`]),
      this.runWithExitCode('git', ['symbolic-ref', '--short', '-q', 'HEAD']),
      this.run('git', ['status', '--porcelain', '--untracked-files=no']),
    ]);
    const localCommit = local.stdout.trim();
    const dirty = Boolean(dirtyResult.stdout.trim());
    const remoteExists = Boolean(remote.stdout.trim().split(/\s+/)[0]);
    let remoteCommit = '';
    let transition: UpdateTransition = {
      mode: 'blocked',
      reason: `Branchen ${branch} findes ikke på ${this.remote}.`,
      checkoutTarget: null,
    };
    if (remoteExists) {
      await this.run('git', ['fetch', '--prune', this.remote, branch], 60_000);
      remoteCommit = (await this.run('git', ['rev-parse', 'FETCH_HEAD'])).stdout.trim();
      transition = dirty
        ? { mode: 'blocked', reason: 'Tracked filer indeholder lokale ændringer.', checkoutTarget: null }
        : await this.inspectTransition(localCommit, remoteCommit);
    }
    const blockers = [
      ...(dirty ? ['Tracked filer indeholder lokale ændringer.'] : []),
      ...(!remoteExists ? [`Branchen ${branch} findes ikke på ${this.remote}.`] : []),
      ...(remoteExists && !dirty && transition.mode === 'blocked' ? [transition.reason] : []),
    ];
    return {
      ...base,
      localCommit,
      remoteCommit: remoteCommit || null,
      currentBranch: currentBranchResult.exitCode === 0 ? currentBranchResult.stdout.trim() : 'detached',
      dirty,
      hasUpdate: Boolean(remoteCommit && remoteCommit !== localCommit),
      canApply: blockers.length === 0 && !this.updateInProgress,
      transitionMode: transition.mode,
      transitionReason: transition.reason,
      blockers,
    };
  }

  async branches(accountId: string) {
    if (!this.enabled) throw new BadRequestException({ code: 'updater_disabled', message: 'Updater is disabled by configuration' });
    if (!this.isConfigured()) throw new BadRequestException({ code: 'updater_not_configured', message: 'Updater repository path is not a Git checkout' });
    const result = await this.run('git', ['ls-remote', '--heads', this.remote], 60_000);
    const branches = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[1] ?? '')
      .filter((ref) => ref.startsWith('refs/heads/'))
      .map((ref) => ref.slice('refs/heads/'.length))
      .filter((branch) => {
        try { validateBranch(branch); return true; } catch { return false; }
      })
      .sort((left, right) => left.localeCompare(right));
    return { selected: await this.selectedBranch(accountId), branches };
  }

  async selectBranch(accountId: string, requestedBranch: string) {
    const branch = validateBranch(requestedBranch);
    const available = await this.branches(accountId);
    if (!available.branches.includes(branch)) {
      throw new BadRequestException({ code: 'update_branch_missing', message: 'Selected branch does not exist on the configured remote' });
    }
    await this.prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: 'updater.branch' } },
      create: { accountId, key: 'updater.branch', value: branch },
      update: { value: branch },
    });
    return this.status(accountId);
  }

  async apply(accountId: string) {
    if (!this.enabled) throw new BadRequestException({ code: 'updater_disabled', message: 'Updater is disabled by configuration' });
    if (!this.isConfigured()) throw new BadRequestException({ code: 'updater_not_configured', message: 'Updater repository path is not a Git checkout' });
    if (this.updateInProgress) throw new ConflictException({ code: 'update_in_progress', message: 'Another update is already running' });

    this.updateInProgress = true;
    try {
      const branch = await this.selectedBranch(accountId);
      const before = (await this.run('git', ['rev-parse', 'HEAD'])).stdout.trim();
      const dirty = (await this.run('git', ['status', '--porcelain', '--untracked-files=no'])).stdout.trim();
      if (dirty) throw new ConflictException({ code: 'update_dirty_worktree', message: 'Tracked files contain local changes; update was refused' });

      const available = await this.run('git', ['ls-remote', this.remote, `refs/heads/${branch}`]);
      if (!available.stdout.trim()) {
        throw new BadRequestException({ code: 'update_branch_missing', message: 'Selected branch does not exist on the configured remote' });
      }
      await this.run('git', ['fetch', '--prune', this.remote, branch], 60_000);
      const targetCommit = (await this.run('git', ['rev-parse', 'FETCH_HEAD'])).stdout.trim();
      const transition = await this.inspectTransition(before, targetCommit);
      if (transition.mode === 'blocked' || !transition.checkoutTarget && transition.mode !== 'up-to-date') {
        throw new ConflictException({
          code: 'update_not_fast_forward',
          message: 'Selected branch is not a forward-only update from the running commit',
          details: {
            reason: transition.reason,
            localCommit: before,
            targetCommit,
          },
        });
      }
      if (transition.checkoutTarget) {
        await this.run('git', ['switch', '--detach', transition.checkoutTarget], 120_000);
      }
      const after = (await this.run('git', ['rev-parse', 'HEAD'])).stdout.trim();
      const changed = before !== after;
      const restartScheduled = changed ? await this.scheduleRestart() : false;
      return {
        updated: changed,
        previousCommit: before,
        currentCommit: after,
        transitionMode: transition.mode,
        restartMode: this.restartMode,
        restartScheduled,
      };
    } finally {
      this.updateInProgress = false;
    }
  }

  private isConfigured(): boolean {
    return existsSync(this.repositoryPath) && existsSync(join(this.repositoryPath, '.git'));
  }

  private async scheduleRestart(): Promise<boolean> {
    if (this.restartMode === 'none') return false;
    const systemdService = process.env.BB_MEDIA_SYSTEMD_SERVICE ?? 'bb-media.target';
    if (this.restartMode === 'docker-compose') {
      await this.scheduleDockerComposeRestart();
      return true;
    }
    const command = this.useSudo ? 'sudo' : 'systemctl';
    const args = this.useSudo ? ['-n', 'systemctl', 'restart', systemdService] : ['restart', systemdService];
    setTimeout(() => {
      const child = spawn(command, args, {
        cwd: this.repositoryPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    }, 750);
    return true;
  }

  private async scheduleDockerComposeRestart(): Promise<void> {
    const containerId = process.env.HOSTNAME;
    if (!containerId) {
      throw new ServiceUnavailableException({
        code: 'update_runner_unavailable',
        message: 'Updater could not identify the running API container',
      });
    }
    const image = (await this.run('docker', ['inspect', '--format={{.Image}}', containerId])).stdout.trim();
    if (!image) {
      throw new ServiceUnavailableException({
        code: 'update_runner_unavailable',
        message: 'Updater could not identify its Docker image',
      });
    }
    const runnerName = 'boltbytes-media-updater-runner';
    await this.runWithExitCode('docker', ['rm', '--force', runnerName]);
    await this.run('docker', [
      'run',
      '--detach',
      '--name',
      runnerName,
      '--user',
      '0:0',
      '--volume',
      '/var/run/docker.sock:/var/run/docker.sock',
      '--volume',
      `${this.repositoryPath}:${this.repositoryPath}`,
      '--workdir',
      this.repositoryPath,
      '--entrypoint',
      'sh',
      image,
      '-lc',
      'sleep 2; docker compose -f docker-compose.yml -f docker-compose.updater.yml up --detach --build --remove-orphans --wait --wait-timeout 300 && docker compose -f docker-compose.yml -f docker-compose.updater.yml restart proxy',
    ], 60_000);
  }

  private async selectedBranch(accountId: string): Promise<string> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: 'updater.branch' } },
      select: { value: true },
    });
    return typeof setting?.value === 'string' ? validateBranch(setting.value) : this.defaultBranch;
  }

  private async inspectTransition(localCommit: string, targetCommit: string): Promise<UpdateTransition> {
    if (localCommit === targetCommit) {
      return classifyUpdateTransition({
        localCommit,
        targetCommit,
        isAncestor: false,
        localTree: null,
        targetHistoryTrees: [],
      });
    }
    const ancestor = await this.runWithExitCode('git', ['merge-base', '--is-ancestor', localCommit, targetCommit]);
    if (ancestor.exitCode === 0) {
      return classifyUpdateTransition({
        localCommit,
        targetCommit,
        isAncestor: true,
        localTree: null,
        targetHistoryTrees: [],
      });
    }
    if (ancestor.exitCode !== 1) {
      throw new ServiceUnavailableException({
        code: 'update_command_failed',
        message: 'git failed during updater transition inspection',
        details: ancestor.stderr.slice(0, 2_000),
      });
    }
    const [localTree, targetTrees] = await Promise.all([
      this.run('git', ['show', '-s', '--format=%T', localCommit]),
      this.run('git', ['log', '--format=%T', targetCommit], 60_000),
    ]);
    return classifyUpdateTransition({
      localCommit,
      targetCommit,
      isAncestor: false,
      localTree: localTree.stdout.trim() || null,
      targetHistoryTrees: targetTrees.stdout.split(/\r?\n/).map((tree) => tree.trim()).filter(Boolean),
    });
  }

  private async run(command: string, args: string[], timeout = 20_000): Promise<CommandResult> {
    const result = await this.runWithExitCode(command, args, timeout);
    if (result.exitCode !== 0) {
      throw new ServiceUnavailableException({
        code: 'update_command_failed',
        message: `${command} failed during updater operation`,
        details: result.stderr.slice(0, 2_000),
      });
    }
    return result;
  }

  private async runWithExitCode(command: string, args: string[], timeout = 20_000): Promise<CommandResult & { exitCode: number }> {
    try {
      const commandArguments = command === 'git'
        ? ['-c', `safe.directory=${this.repositoryPath}`, ...args]
        : args;
      const result = await execFileAsync(command, commandArguments, {
        cwd: this.repositoryPath,
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const value = error as { stdout?: string; stderr?: string; code?: number | string; message?: string };
      return {
        stdout: value.stdout ?? '',
        stderr: value.stderr ?? value.message ?? 'Unknown updater command error',
        exitCode: typeof value.code === 'number' ? value.code : 1,
      };
    }
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function validateGitName(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(value)) throw new Error(`Invalid updater ${field}`);
  return value;
}

function validateBranch(value: string): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(value) ||
    value.includes('..') ||
    value.includes('//') ||
    value.endsWith('/') ||
    value.endsWith('.')
  ) throw new Error('Invalid updater branch');
  return value;
}

function normalizeRestartMode(value: string | undefined): RestartMode {
  if (value === 'systemd' || value === 'docker-compose') return value;
  return 'none';
}
