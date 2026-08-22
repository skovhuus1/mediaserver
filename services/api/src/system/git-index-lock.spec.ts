import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectGitIndexLock, recoverStaleGitIndexLock } from './git-index-lock';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repositoryWithLock(ageMs: number) {
  const root = await mkdtemp(join(tmpdir(), 'bb-media-git-lock-'));
  roots.push(root);
  await mkdir(join(root, '.git'));
  const lockPath = join(root, '.git', 'index.lock');
  await writeFile(lockPath, '');
  const modified = new Date(Date.now() - ageMs);
  await utimes(lockPath, modified, modified);
  return { root, lockPath };
}

describe('Git index lock recovery', () => {
  it('does not remove a recent lock', async () => {
    const { root } = await repositoryWithLock(30_000);
    const result = await recoverStaleGitIndexLock(root, { findOwnerPids: async () => [] });
    expect(result.state).toBe('recent');
    expect((await inspectGitIndexLock(root)).state).toBe('recent');
  });

  it('does not remove an old lock held by a process', async () => {
    const { root } = await repositoryWithLock(10 * 60_000);
    const result = await recoverStaleGitIndexLock(root, { findOwnerPids: async () => [421, 421] });
    expect(result).toMatchObject({ state: 'active', ownerPids: [421] });
  });

  it('removes an old lock without an owner', async () => {
    const { root } = await repositoryWithLock(10 * 60_000);
    const result = await recoverStaleGitIndexLock(root, { findOwnerPids: async () => [] });
    expect(result.state).toBe('removed');
    expect((await inspectGitIndexLock(root)).state).toBe('missing');
  });

  it('refuses recovery when ownership cannot be verified', async () => {
    const { root } = await repositoryWithLock(10 * 60_000);
    const result = await recoverStaleGitIndexLock(root, {
      findOwnerPids: async () => { throw new Error('host PID namespace unavailable'); },
    });
    expect(result.state).toBe('unknown');
    expect(result.reason).toContain('host PID namespace unavailable');
  });
});
