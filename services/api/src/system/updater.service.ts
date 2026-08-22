import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { classifyUpdateTransition, type UpdateTransition } from './update-transition';
import {
  inspectGitIndexLock,
  findOpenFileOwnerPids,
  recoverStaleGitIndexLock,
  type GitIndexLockInspection,
} from './git-index-lock';
import {
  idleUpdateProgress,
  isActiveRunnerState,
  parseRunnerProgress,
  readUpdateProgress,
  type UpdateProgress,
} from './updater-progress';

const execFileAsync = promisify(execFile);
const DOCKER_RUNNER_NAME = 'boltbytes-media-updater-runner';
type RestartMode = 'none' | 'systemd' | 'docker-compose';

type CommandResult = {
  stdout: string;
  stderr: string;
};

@Injectable()
export class UpdaterService {
  private updateInProgress = false;
  private readonly startedAt = Date.now();
  private readonly enabled = parseBoolean(process.env.BB_MEDIA_UPDATE_ENABLED, false);
  private readonly repositoryPath = resolve(process.env.BB_MEDIA_UPDATE_REPO_PATH || process.cwd());
  private readonly remote = validateGitName(process.env.BB_MEDIA_UPDATE_REMOTE ?? 'origin', 'remote');
  private readonly defaultBranch = validateBranch(process.env.BB_MEDIA_UPDATE_BRANCH ?? 'main');
  private readonly restartMode = normalizeRestartMode(process.env.BB_MEDIA_UPDATE_RESTART_MODE);
  private readonly useSudo = parseBoolean(process.env.BB_MEDIA_UPDATE_USE_SUDO, false);

  constructor(private readonly prisma: PrismaService) {}

  async status(accountId: string) {
    const branch = await this.selectedBranch(accountId);
    const progress = await this.progress(accountId);
    const base = {
      enabled: this.enabled,
      configured: this.isConfigured(),
      repositoryPath: this.repositoryPath,
      remote: this.remote,
      branch,
      restartMode: this.restartMode,
      updateInProgress: this.updateInProgress || progress.state === 'running',
      progress,
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
    const repositoryLock = await this.inspectRepositoryLock();
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
      ...(['active', 'recent', 'unknown'].includes(repositoryLock.state) ? [repositoryLock.reason] : []),
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
      canApply: blockers.length === 0 && !base.updateInProgress,
      transitionMode: transition.mode,
      transitionReason: transition.reason,
      blockers,
      repositoryLock,
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

  async diagnostics(accountId: string) {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      repositoryPath: this.repositoryPath,
      remote: this.remote,
      branch: await this.selectedBranch(accountId),
      restartMode: this.restartMode,
      progress: await this.progress(accountId),
    };
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
    const existingProgress = await this.progress(accountId);
    if (this.updateInProgress || existingProgress.state === 'running') {
      throw new ConflictException({ code: 'update_in_progress', message: 'Another update is already running' });
    }

    this.updateInProgress = true;
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    let before: string | null = null;
    let targetCommit: string | null = null;
    await this.writeProgress(accountId, {
      runId,
      state: 'running',
      phase: 'checking',
      percent: 5,
      message: 'Kontrollerer repository og valgt branch.',
      startedAt,
      updatedAt: startedAt,
      previousCommit: null,
      targetCommit: null,
      error: null,
    });
    try {
      const branch = await this.selectedBranch(accountId);
      await this.advanceProgress(
        accountId,
        runId,
        8,
        'permissions',
        'Kontrollerer repository-ejerskab.',
      );
      await this.repairRepositoryOwnership();
      await this.advanceProgress(accountId, runId, 10, 'git-lock', 'Kontrollerer Git checkout-lås.');
      const repositoryLock = await this.recoverRepositoryLock();
      if (repositoryLock.state === 'active' || repositoryLock.state === 'recent' || repositoryLock.state === 'unknown') {
        throw new ConflictException({
          code: 'update_git_lock_active',
          message: repositoryLock.reason,
          details: repositoryLock,
        });
      }
      if (repositoryLock.state === 'removed') {
        await this.advanceProgress(accountId, runId, 11, 'git-lock-recovered', 'En efterladt Git-lås blev fjernet sikkert.');
      }
      before = (await this.run('git', ['rev-parse', 'HEAD'])).stdout.trim();
      await this.advanceProgress(accountId, runId, 12, 'worktree', 'Kontrollerer lokale ændringer.', { previousCommit: before });
      const dirty = (await this.run('git', ['status', '--porcelain', '--untracked-files=no'])).stdout.trim();
      if (dirty) throw new ConflictException({ code: 'update_dirty_worktree', message: 'Tracked files contain local changes; update was refused' });

      await this.advanceProgress(accountId, runId, 20, 'fetching', `Henter ${this.remote}/${branch}.`);
      const available = await this.run('git', ['ls-remote', this.remote, `refs/heads/${branch}`]);
      if (!available.stdout.trim()) {
        throw new BadRequestException({ code: 'update_branch_missing', message: 'Selected branch does not exist on the configured remote' });
      }
      await this.run('git', ['fetch', '--prune', this.remote, branch], 60_000);
      targetCommit = (await this.run('git', ['rev-parse', 'FETCH_HEAD'])).stdout.trim();
      await this.advanceProgress(accountId, runId, 35, 'validating', 'Validerer fast-forward eller squash-equivalent overgang.', { targetCommit });
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
        await this.advanceProgress(accountId, runId, 48, 'checkout', `Skifter sikkert til ${targetCommit.slice(0, 12)}.`);
        await this.run('git', ['switch', '--detach', transition.checkoutTarget], 120_000);
      }
      const after = (await this.run('git', ['rev-parse', 'HEAD'])).stdout.trim();
      const changed = before !== after;
      await this.advanceProgress(
        accountId,
        runId,
        changed ? 55 : 100,
        changed ? 'scheduled' : 'completed',
        changed ? 'Koden er hentet. Genstart planlægges.' : 'Serveren kører allerede den valgte version.',
      );
      const restartScheduled = changed ? await this.scheduleRestart(accountId, runId) : false;
      if (!changed || !restartScheduled) {
        await this.advanceProgress(
          accountId,
          runId,
          100,
          'completed',
          changed ? 'Koden er opdateret; genstart skal udføres manuelt.' : 'Serveren er allerede opdateret.',
        );
      }
      return {
        updated: changed,
        previousCommit: before,
        currentCommit: after,
        transitionMode: transition.mode,
        restartMode: this.restartMode,
        restartScheduled,
      };
    } catch (error) {
      const message = updaterErrorMessage(error);
      const failedAt = await this.progress(accountId).catch(() => idleUpdateProgress());
      await this.writeProgress(accountId, {
        runId,
        state: 'failed',
        phase: 'failed',
        percent: failedAt.runId === runId ? failedAt.percent : 0,
        message,
        startedAt,
        updatedAt: new Date().toISOString(),
        previousCommit: before,
        targetCommit,
        error: message,
      }).catch(() => undefined);
      throw error;
    } finally {
      this.updateInProgress = false;
    }
  }

  async progress(accountId: string): Promise<UpdateProgress> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: 'updater.last-run' } },
      select: { value: true },
    });
    const stored = setting ? readUpdateProgress(setting.value) : idleUpdateProgress();
    if (this.restartMode === 'docker-compose') {
      const runner = await this.dockerRunnerProgress();
      if (!runner || !runner.runId || runner.runId !== stored.runId) {
        if (
          stored.state === 'running' &&
          stored.updatedAt &&
          Date.now() - Date.parse(stored.updatedAt) > 10 * 60_000
        ) {
          const failed: UpdateProgress = {
            ...stored,
            state: 'failed',
            phase: 'failed',
            message: 'Updater-runneren blev ikke fundet, og opdateringen udløb.',
            updatedAt: new Date().toISOString(),
            error: 'Ingen aktiv updater-runner blev fundet efter ti minutter.',
          };
          await this.writeProgress(accountId, failed);
          return failed;
        }
        return stored;
      }
      const merged = { ...stored, ...runner };
      if (stored.state !== merged.state || stored.phase !== merged.phase || stored.percent !== merged.percent) {
        await this.writeProgress(accountId, merged).catch(() => undefined);
      }
      return merged;
    }
    if (
      this.restartMode === 'systemd' &&
      stored.state === 'running' &&
      stored.phase === 'restarting' &&
      stored.updatedAt &&
      this.startedAt > Date.parse(stored.updatedAt)
    ) {
      const completed: UpdateProgress = {
        ...stored,
        state: 'completed',
        phase: 'completed',
        percent: 100,
        message: 'Systemd-services er genstartet med den nye version.',
        updatedAt: new Date().toISOString(),
        error: null,
      };
      await this.writeProgress(accountId, completed);
      return completed;
    }
    return stored;
  }

  async reset(accountId: string): Promise<UpdateProgress> {
    if (this.updateInProgress) {
      throw new ConflictException({
        code: 'update_in_progress',
        message: 'Updateren arbejder stadig og kan ikke nulstilles endnu',
      });
    }

    if (this.restartMode === 'docker-compose') {
      const inspection = await this.runWithExitCode(
        'docker',
        ['inspect', '--format={{.State.Status}}', DOCKER_RUNNER_NAME],
        5_000,
      );
      if (inspection.exitCode === 0) {
        const runnerState = inspection.stdout.trim();
        if (isActiveRunnerState(runnerState)) {
          throw new ConflictException({
            code: 'update_runner_active',
            message: `Updater-runneren er stadig ${runnerState} og kan ikke nulstilles sikkert`,
          });
        }
        await this.run('docker', ['rm', '--force', DOCKER_RUNNER_NAME], 10_000);
      }
    }

    const idle = idleUpdateProgress();
    await this.writeProgress(accountId, idle);
    return idle;
  }

  private isConfigured(): boolean {
    return existsSync(this.repositoryPath) && existsSync(join(this.repositoryPath, '.git'));
  }

  private async scheduleRestart(accountId: string, runId: string): Promise<boolean> {
    if (this.restartMode === 'none') return false;
    const systemdService = process.env.BB_MEDIA_SYSTEMD_SERVICE ?? 'bb-media.target';
    if (this.restartMode === 'docker-compose') {
      await this.scheduleDockerComposeRestart(runId);
      return true;
    }
    await this.advanceProgress(accountId, runId, 90, 'restarting', `Genstarter ${systemdService}.`);
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

  private async scheduleDockerComposeRestart(runId: string): Promise<void> {
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
    await this.runWithExitCode('docker', ['rm', '--force', DOCKER_RUNNER_NAME]);
    await this.run('docker', [
      'run',
      '--detach',
      '--name',
      DOCKER_RUNNER_NAME,
      '--label',
      `bb.media.update.run-id=${runId}`,
      '--env',
      `BB_UPDATE_RUN_ID=${runId}`,
      '--user',
      '0:0',
      '--volume',
      '/var/run/docker.sock:/var/run/docker.sock',
      '--volume',
      `${this.repositoryPath}:${this.repositoryPath}:ro`,
      '--workdir',
      this.repositoryPath,
      '--entrypoint',
      'sh',
      image,
      '-lc',
      'sh scripts/run-update.sh',
    ], 60_000);
  }

  private async repairRepositoryOwnership(): Promise<void> {
    if (this.restartMode !== 'docker-compose') return;
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    const containerId = process.env.HOSTNAME;
    if (uid === undefined || gid === undefined || !containerId) {
      throw new ServiceUnavailableException({
        code: 'update_ownership_repair_unavailable',
        message: 'Updater could not determine the API process ownership',
      });
    }
    const image = (
      await this.run('docker', ['inspect', '--format={{.Image}}', containerId])
    ).stdout.trim();
    if (!image) {
      throw new ServiceUnavailableException({
        code: 'update_ownership_repair_unavailable',
        message: 'Updater could not identify its Docker image',
      });
    }
    await this.run('docker', [
      'run',
      '--rm',
      '--user',
      '0:0',
      '--volume',
      `${this.repositoryPath}:${this.repositoryPath}`,
      '--entrypoint',
      'chown',
      image,
      '-R',
      `${uid}:${gid}`,
      this.repositoryPath,
    ], 120_000);
  }

  private async inspectRepositoryLock(): Promise<GitIndexLockInspection> {
    return inspectGitIndexLock(this.repositoryPath, {
      findOwnerPids: (lockPath) => this.repositoryLockOwnerPids(lockPath),
    });
  }

  private async recoverRepositoryLock(): Promise<GitIndexLockInspection> {
    return recoverStaleGitIndexLock(this.repositoryPath, {
      findOwnerPids: (lockPath) => this.repositoryLockOwnerPids(lockPath),
    });
  }

  private async repositoryLockOwnerPids(lockPath: string): Promise<number[]> {
    if (this.restartMode !== 'docker-compose') return findOpenFileOwnerPids(lockPath);
    const containerId = process.env.HOSTNAME;
    if (!containerId) throw new Error('API container identity is unavailable');
    const image = (await this.run('docker', ['inspect', '--format={{.Image}}', containerId])).stdout.trim();
    if (!image) throw new Error('API image is unavailable');
    const script = 'target="$1"; for fd in /proc/[0-9]*/fd/*; do linked="$(readlink "$fd" 2>/dev/null || true)"; if [ "$linked" = "$target" ] || [ "$linked" = "$target (deleted)" ]; then pid="${fd#/proc/}"; echo "${pid%%/*}"; fi; done';
    const result = await this.run('docker', [
      'run', '--rm', '--pid', 'host', '--user', '0:0',
      '--volume', `${this.repositoryPath}:${this.repositoryPath}:ro`,
      '--entrypoint', 'sh', image, '-lc', script, 'git-lock-scan', lockPath,
    ], 30_000);
    return result.stdout.split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  private async dockerRunnerProgress(): Promise<Partial<UpdateProgress> | null> {
    const inspect = await this.runWithExitCode('docker', [
      'inspect',
      '--format={{.State.Status}}|{{.State.ExitCode}}|{{index .Config.Labels "bb.media.update.run-id"}}',
      DOCKER_RUNNER_NAME,
    ], 5_000);
    if (inspect.exitCode !== 0) return null;
    const logs = await this.runWithExitCode(
      'docker',
      ['logs', '--tail', '80', DOCKER_RUNNER_NAME],
      5_000,
    );
    const combinedLogs = [logs.stdout, logs.stderr].filter(Boolean).join('\n');
    const parsed = parseRunnerProgress(combinedLogs);
    const [containerState, exitCodeText, runId] = inspect.stdout.trim().split('|');
    const logTail = combinedLogs
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('BB_UPDATE_PROGRESS|'))
      .slice(-24)
      .map((line) => line.slice(0, 500));
    if (parsed) return { ...parsed, runId: runId || null, logTail };
    if (containerState === 'exited') {
      const message = `Updater-runneren stoppede uden statusmarkør (exit ${exitCodeText || 'ukendt'}).`;
      return { runId: runId || null, state: 'failed', phase: 'failed', message, error: message, updatedAt: new Date().toISOString(), logTail };
    }
    return logTail.length ? { runId: runId || null, logTail } : null;
  }

  private async advanceProgress(
    accountId: string,
    runId: string,
    percent: number,
    phase: string,
    message: string,
    values: Partial<Pick<UpdateProgress, 'previousCommit' | 'targetCommit'>> = {},
  ): Promise<void> {
    const current = await this.progress(accountId);
    await this.writeProgress(accountId, {
      ...current,
      ...values,
      runId,
      state: phase === 'completed' ? 'completed' : 'running',
      phase,
      percent,
      message,
      updatedAt: new Date().toISOString(),
      error: null,
    });
  }

  private async writeProgress(accountId: string, progress: UpdateProgress): Promise<void> {
    const value = progress as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: 'updater.last-run' } },
      create: { accountId, key: 'updater.last-run', value },
      update: { value },
    });
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

function updaterErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Opdateringen fejlede uden en teknisk fejlbesked.';
}
