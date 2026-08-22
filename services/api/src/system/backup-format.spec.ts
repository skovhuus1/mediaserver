import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptBackupToFile, encryptBackupStream, readBackupHeader } from './backup-format';

const key = `base64:${Buffer.alloc(32, 7).toString('base64')}`;
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('encrypted backup format', () => {
  it('round-trips a streamed archive with an authenticated versioned header', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bb-backup-')); directories.push(directory);
    const backup = join(directory, 'backup.bbbackup'); const restored = join(directory, 'restore.dump');
    await encryptBackupStream(Readable.from(Buffer.from('postgres-custom-archive')), backup, { createdAt: '2026-08-22T12:00:00.000Z', schemaVersion: 'migration-1', accountId: 'account-1', reason: 'manual' }, key);
    expect((await readBackupHeader(backup)).header).toMatchObject({ formatVersion: 1, schemaVersion: 'migration-1', accountId: 'account-1' });
    await decryptBackupToFile(backup, restored, key);
    expect(await readFile(restored, 'utf8')).toBe('postgres-custom-archive');
  });

  it('rejects a backup with the wrong server encryption key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bb-backup-')); directories.push(directory);
    const backup = join(directory, 'backup.bbbackup');
    await encryptBackupStream(Readable.from(Buffer.from('secret')), backup, { createdAt: new Date().toISOString(), schemaVersion: 'migration-1', accountId: 'account-1', reason: 'manual' }, key);
    await expect(decryptBackupToFile(backup, join(directory, 'invalid.dump'), `base64:${Buffer.alloc(32, 8).toString('base64')}`)).rejects.toThrow();
  });
});
