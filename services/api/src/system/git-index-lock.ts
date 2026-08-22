import { lstat, readlink, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const GIT_INDEX_LOCK_STALE_AFTER_MS = 5 * 60_000;

export type GitIndexLockState = 'missing' | 'recent' | 'active' | 'stale' | 'removed' | 'unknown';

export type GitIndexLockInspection = {
  path: string;
  state: GitIndexLockState;
  ageMs: number | null;
  modifiedAt: string | null;
  inode: number | null;
  size: number | null;
  ownerPids: number[];
  reason: string;
};

type OwnerResolver = (lockPath: string) => Promise<number[]>;

type LockOptions = {
  now?: number;
  staleAfterMs?: number;
  findOwnerPids?: OwnerResolver;
};

export async function inspectGitIndexLock(
  repositoryPath: string,
  options: LockOptions = {},
): Promise<GitIndexLockInspection> {
  const lockPath = resolve(repositoryPath, '.git', 'index.lock');
  let stats;
  try {
    stats = await lstat(lockPath);
  } catch (error) {
    if (isMissing(error)) return missingInspection(lockPath);
    throw error;
  }

  const ageMs = Math.max(0, (options.now ?? Date.now()) - stats.mtimeMs);
  const base = {
    path: lockPath,
    ageMs,
    modifiedAt: stats.mtime.toISOString(),
    inode: stats.ino,
    size: stats.size,
  };
  let ownerPids: number[] = [];
  if (options.findOwnerPids) {
    try {
      ownerPids = [...new Set(await options.findOwnerPids(lockPath))]
        .filter((pid) => Number.isInteger(pid) && pid > 0)
        .sort((left, right) => left - right);
    } catch (error) {
      return {
        ...base,
        state: 'unknown',
        ownerPids: [],
        reason: `Git lock ownership could not be verified: ${errorMessage(error)}`,
      };
    }
  }
  if (ownerPids.length) {
    return {
      ...base,
      state: 'active',
      ownerPids,
      reason: `Git index lock is held by process ${ownerPids.join(', ')}.`,
    };
  }
  if (ageMs < (options.staleAfterMs ?? GIT_INDEX_LOCK_STALE_AFTER_MS)) {
    return {
      ...base,
      state: 'recent',
      ownerPids: [],
      reason: 'Git index lock is newer than the stale-lock grace period.',
    };
  }
  return {
    ...base,
    state: 'stale',
    ownerPids: [],
    reason: 'Git index lock exceeded the grace period and has no active owner.',
  };
}

export async function recoverStaleGitIndexLock(
  repositoryPath: string,
  options: LockOptions = {},
): Promise<GitIndexLockInspection> {
  const inspection = await inspectGitIndexLock(repositoryPath, options);
  if (inspection.state !== 'stale') return inspection;

  let current;
  try {
    current = await lstat(inspection.path);
  } catch (error) {
    if (isMissing(error)) return missingInspection(inspection.path);
    throw error;
  }
  if (
    current.ino !== inspection.inode ||
    current.mtime.toISOString() !== inspection.modifiedAt ||
    current.size !== inspection.size
  ) {
    return inspectGitIndexLock(repositoryPath, options);
  }
  await unlink(inspection.path);
  return {
    ...inspection,
    state: 'removed',
    reason: 'Stale Git index lock was removed safely before checkout.',
  };
}

export async function findOpenFileOwnerPids(lockPath: string, procRoot = '/proc'): Promise<number[]> {
  let processes;
  try {
    processes = await readdir(procRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const target = resolve(lockPath);
  const owners = new Set<number>();
  await Promise.all(processes.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name)).map(async (processEntry) => {
    const fdPath = join(procRoot, processEntry.name, 'fd');
    let descriptors;
    try {
      descriptors = await readdir(fdPath);
    } catch {
      return;
    }
    for (const descriptor of descriptors) {
      try {
        const linked = await readlink(join(fdPath, descriptor));
        if (linked === target || linked === `${target} (deleted)`) {
          owners.add(Number.parseInt(processEntry.name, 10));
          return;
        }
      } catch {
        continue;
      }
    }
  }));
  return [...owners].sort((left, right) => left - right);
}

function missingInspection(path: string): GitIndexLockInspection {
  return {
    path,
    state: 'missing',
    ageMs: null,
    modifiedAt: null,
    inode: null,
    size: null,
    ownerPids: [],
    reason: 'No Git index lock exists.',
  };
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
