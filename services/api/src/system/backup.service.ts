import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import type { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { Request } from 'express';
import { correlationId } from '../common/request-context';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptBackupToFile, encryptBackupStream, readBackupHeader, type BackupHeader } from './backup-format';

const BACKUP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.bbbackup$/;
type Operation = { kind: 'backup' | 'import' | 'restore' | 'delete'; stage: string; startedAt: string };

@Injectable()
export class BackupService {
  private readonly directory = process.env.BB_MEDIA_BACKUP_PATH?.trim() || '/app/data/backups';
  private readonly retention = boundedNumber(process.env.BB_MEDIA_BACKUP_RETENTION, 12, 2, 100);
  private readonly uploadLimit = boundedNumber(process.env.BB_MEDIA_BACKUP_MAX_BYTES, 20 * 1024 ** 3, 1024 ** 2, 100 * 1024 ** 3);
  private operation: Operation | null = null;

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async list(actor: AuthenticatedUser) {
    await this.requireOwner(actor);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const currentSchema = await this.schemaVersion();
    const files = (await readdir(this.directory)).filter((name) => BACKUP_NAME.test(name));
    const items = (await Promise.all(files.map(async (filename) => {
      try {
        const path = this.path(filename); const [{ header, size }, details] = await Promise.all([readBackupHeader(path), stat(path)]);
        return present(filename, header, size, details.mtime.toISOString(), header.accountId === actor.accountId && header.schemaVersion === currentSchema);
      } catch { return null; }
    }))).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { encrypted: true, cipher: 'AES-256-GCM+HKDF-SHA256', retention: this.retention, schemaVersion: currentSchema, operation: this.operation, items };
  }

  async create(actor: AuthenticatedUser) {
    await this.requireOwner(actor);
    return this.withLock('backup', 'Forbereder database', async () => {
      const item = await this.createUnlocked(actor.accountId, 'manual');
      await this.audit(actor, 'system.backup_create', 'backup_created', { filename: item.filename, sizeBytes: item.sizeBytes });
      return item;
    });
  }

  async import(actor: AuthenticatedUser, request: Request, contentLength: string | undefined) {
    await this.requireOwner(actor);
    const declared = Number(contentLength ?? 0);
    if (declared > this.uploadLimit) throw new BadRequestException({ code: 'backup_too_large', message: 'Backupfilen er større end serverens uploadgrænse.' });
    return this.withLock('import', 'Modtager krypteret backup', async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = join(this.directory, `.import-${randomBytes(8).toString('hex')}.tmp`);
      let bytes = 0; const file = await open(temporary, 'wx', 0o600);
      try {
        try {
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > this.uploadLimit) throw new BadRequestException({ code: 'backup_too_large', message: 'Backupfilen overskred serverens uploadgrænse.' });
            await file.write(buffer);
          }
        } finally { await file.close(); }
        this.setStage('Validerer kryptering og PostgreSQL-arkiv');
        const header = await this.validateArchive(temporary);
        if (header.accountId !== actor.accountId) throw new ForbiddenException({ code: 'backup_account_mismatch', message: 'Backupfilen tilhører ikke denne BoltBytes-server.' });
        const filename = uniqueFilename('imported', header.createdAt);
        await rename(temporary, this.path(filename));
        await this.prune();
        await this.audit(actor, 'system.backup_import', 'backup_imported', { filename, sizeBytes: bytes });
        return present(filename, header, bytes, new Date().toISOString(), header.schemaVersion === await this.schemaVersion());
      } catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
    });
  }

  async download(actor: AuthenticatedUser, filename: string) {
    await this.requireOwner(actor); const path = await this.existingPath(filename); const details = await stat(path);
    return { filename, path, size: details.size, stream: createReadStream(path) };
  }

  async remove(actor: AuthenticatedUser, filename: string) {
    await this.requireOwner(actor);
    return this.withLock('delete', 'Sletter backup', async () => {
      await unlink(await this.existingPath(filename));
      await this.audit(actor, 'system.backup_delete', 'backup_deleted', { filename });
      return { deleted: true, filename };
    });
  }

  async restorePlan(actor: AuthenticatedUser, filename: string) {
    await this.requireOwner(actor); const path = await this.existingPath(filename);
    const [{ header, size }, blockers, currentSchema] = await Promise.all([readBackupHeader(path), this.restoreBlockers(), this.schemaVersion()]);
    if (header.accountId !== actor.accountId) blockers.push('Backupfilen tilhører en anden serverkonto.');
    if (header.schemaVersion !== currentSchema) blockers.push(`Schema ${header.schemaVersion} matcher ikke kørende schema ${currentSchema}.`);
    if (!blockers.length) await this.validateArchive(path);
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const challengeToken = blockers.length ? null : this.signChallenge({ filename, size, schemaVersion: header.schemaVersion, exp: Date.parse(expiresAt), nonce: randomBytes(12).toString('hex') });
    return { allowed: blockers.length === 0, blockers, confirmation: `RESTORE ${filename}`, expiresAt, challengeToken, backup: present(filename, header, size, (await stat(path)).mtime.toISOString(), header.schemaVersion === currentSchema) };
  }

  async restore(actor: AuthenticatedUser, filename: string, challengeToken: string, confirmation: string) {
    await this.requireOwner(actor); const source = await this.existingPath(filename); const details = await stat(source);
    this.verifyChallenge(challengeToken, { filename, size: details.size });
    if (confirmation !== `RESTORE ${filename}`) throw new BadRequestException({ code: 'restore_confirmation_invalid', message: 'Bekræftelsesteksten matcher ikke den valgte backup.' });
    return this.withLock('restore', 'Kontrollerer restore-gates', async () => {
      const blockers = await this.restoreBlockers(); if (blockers.length) throw new ConflictException({ code: 'restore_blocked', message: blockers.join(' ') });
      const header = await this.validateArchive(source); const currentSchema = await this.schemaVersion();
      if (header.accountId !== actor.accountId || header.schemaVersion !== currentSchema) throw new ConflictException({ code: 'restore_incompatible', message: 'Backupfilens account eller schema matcher ikke den kørende server.' });
      this.setStage('Opretter automatisk sikkerhedsbackup'); const safety = await this.createUnlocked(actor.accountId, 'pre-restore');
      const dump = join(this.directory, `.restore-${randomBytes(8).toString('hex')}.dump`);
      try {
        this.setStage('Dekrypterer og autentificerer arkiv'); await decryptBackupToFile(source, dump);
        this.setStage('Gendanner database atomisk'); await runCommand('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', '--dbname', databaseUrl(), dump]);
        this.setStage('Tilbagekalder gamle sessions og rydder cache');
        const now = new Date();
        await this.prisma.$transaction([
          this.prisma.refreshToken.updateMany({ where: { revokedAt: null }, data: { revokedAt: now } }),
          this.prisma.playbackSession.updateMany({ where: { status: { in: ['reserving', 'active', 'paused'] } }, data: { status: 'user_stopped', runtimeState: 'paused', endedAt: now, leaseExpiresAt: now } }),
          this.prisma.streamReservation.updateMany({ where: { releasedAt: null }, data: { releasedAt: now, reason: 'database_restore' } }),
          this.prisma.systemJob.updateMany({ where: { status: { in: ['queued', 'running'] } }, data: { status: 'failed', lockedAt: null, leaseExpiresAt: null, workerId: null } }),
        ]);
        await this.redis.flush();
        await this.audit(actor, 'system.backup_restore', 'backup_restored', { filename, safetyBackup: safety.filename });
        return { restored: true, filename, safetyBackup: safety.filename, sessionsRevoked: true };
      } finally { await unlink(dump).catch(() => undefined); }
    });
  }

  private async createUnlocked(accountId: string, reason: string) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); this.setStage('Eksporterer og krypterer database');
    const createdAt = new Date().toISOString(); const filename = uniqueFilename(reason === 'manual' ? 'backup' : 'pre-restore', createdAt); const destination = this.path(filename);
    const child = spawn('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', '--dbname', databaseUrl()], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    const stderr: Buffer[] = []; child.stderr.on('data', (chunk: Buffer) => { if (Buffer.concat(stderr).length < 8192) stderr.push(chunk); });
    try {
      const schemaVersion = await this.schemaVersion();
      const [, header] = await Promise.all([processExit(child, stderr), encryptBackupStream(child.stdout, destination, { createdAt, schemaVersion, accountId, reason })]);
      const details = await stat(destination); await this.prune(); return present(filename, header, details.size, details.mtime.toISOString(), true);
    } catch (error) { child.kill('SIGTERM'); await unlink(destination).catch(() => undefined); throw error; }
  }

  private async validateArchive(path: string) {
    const dump = join(this.directory, `.validate-${randomBytes(8).toString('hex')}.dump`);
    try { const header = await decryptBackupToFile(path, dump); await runCommand('pg_restore', ['--list', dump]); return header; }
    catch (error) { throw new BadRequestException({ code: 'backup_invalid', message: `Backupfilen kunne ikke valideres: ${safeError(error)}` }); }
    finally { await unlink(dump).catch(() => undefined); }
  }

  private async restoreBlockers() {
    const now = new Date(); const [streams, jobs] = await Promise.all([
      this.prisma.playbackSession.count({ where: { status: { in: ['reserving', 'active', 'paused'] }, leaseExpiresAt: { gt: now } } }),
      this.prisma.systemJob.count({ where: { status: { in: ['queued', 'running'] } } }),
    ]);
    return [...(streams ? [`Stop ${streams} aktive afspilninger før restore.`] : []), ...(jobs ? [`Afslut ${jobs} køede eller kørende jobs før restore.`] : [])];
  }

  private async requireOwner(actor: AuthenticatedUser) {
    const bootstrap = await this.prisma.systemBootstrap.findUnique({ where: { id: 'singleton' }, select: { accountId: true } });
    if (!bootstrap || bootstrap.accountId !== actor.accountId) throw new ForbiddenException({ code: 'server_owner_required', message: 'Kun serverens bootstrap-konto må administrere komplette backups.' });
  }
  private async schemaVersion() { const rows = await this.prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1`; return rows[0]?.migration_name ?? 'unmigrated'; }
  private path(filename: string) { if (!BACKUP_NAME.test(filename) || basename(filename) !== filename) throw new BadRequestException({ code: 'backup_filename_invalid', message: 'Backupfilnavnet er ugyldigt.' }); return join(this.directory, filename); }
  private async existingPath(filename: string) { const path = this.path(filename); try { await stat(path); return path; } catch { throw new NotFoundException({ code: 'backup_not_found', message: 'Backupfilen findes ikke.' }); } }
  private setStage(stage: string) { if (this.operation) this.operation = { ...this.operation, stage }; }
  private async withLock<T>(kind: Operation['kind'], stage: string, action: () => Promise<T>) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); const lockPath = join(this.directory, '.operation.lock'); let lock: FileHandle;
    try { lock = await open(lockPath, 'wx', 0o600); } catch {
      const existing = await stat(lockPath).catch(() => null);
      if (!existing || Date.now() - existing.mtimeMs <= 4 * 60 * 60_000) throw new ConflictException({ code: 'backup_operation_active', message: 'En anden backup- eller restorehandling kører allerede.' });
      await unlink(lockPath).catch(() => undefined);
      try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new ConflictException({ code: 'backup_operation_active', message: 'En anden backup- eller restorehandling overtog låsen.' }); }
    }
    this.operation = { kind, stage, startedAt: new Date().toISOString() };
    try { await lock.writeFile(JSON.stringify(this.operation)); return await action(); } finally { this.operation = null; await lock.close(); await unlink(lockPath).catch(() => undefined); }
  }
  private signChallenge(payload: Record<string, unknown>) { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}.${createHmac('sha256', process.env.JWT_SECRET ?? '').update(body).digest('base64url')}`; }
  private verifyChallenge(token: string, expected: { filename: string; size: number }) {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw new BadRequestException({ code: 'restore_challenge_invalid', message: 'Restore-challenge er ugyldig.' });
    const calculated = createHmac('sha256', process.env.JWT_SECRET ?? '').update(body).digest(); const supplied = Buffer.from(signature, 'base64url');
    if (calculated.length !== supplied.length || !timingSafeEqual(calculated, supplied)) throw new BadRequestException({ code: 'restore_challenge_invalid', message: 'Restore-challenge er manipuleret.' });
    let payload: { filename?: string; size?: number; exp?: number };
    try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof payload; } catch { throw new BadRequestException({ code: 'restore_challenge_invalid', message: 'Restore-challenge kan ikke afkodes.' }); }
    if (payload.filename !== expected.filename || payload.size !== expected.size || !payload.exp || payload.exp < Date.now()) throw new BadRequestException({ code: 'restore_challenge_expired', message: 'Restore-challenge er udløbet eller matcher ikke filen.' });
  }
  private async prune() { const entries = (await readdir(this.directory)).filter((name) => BACKUP_NAME.test(name)); const ranked = await Promise.all(entries.map(async (name) => ({ name, mtime: (await stat(this.path(name))).mtimeMs }))); for (const entry of ranked.sort((a, b) => b.mtime - a.mtime).slice(this.retention)) await unlink(this.path(entry.name)).catch(() => undefined); }
  private audit(actor: AuthenticatedUser, action: string, code: string, details: Record<string, unknown>) { return this.prisma.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: actor.profileId ?? null, correlationId: correlationId(), action, outcome: 'allowed', code, details: details as Prisma.InputJsonValue } }); }
}

function databaseUrl() { const value = process.env.DATABASE_URL; if (!value) throw new Error('DATABASE_URL is not configured'); const url = new URL(value); ['schema', 'connection_limit', 'pool_timeout'].forEach((key) => url.searchParams.delete(key)); return url.toString(); }
function uniqueFilename(prefix: string, createdAt: string) { return `${prefix}-${createdAt.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.bbbackup`; }
function present(filename: string, header: BackupHeader, sizeBytes: number, modifiedAt: string, restoreCompatible: boolean) { return { filename, createdAt: header.createdAt, modifiedAt, sizeBytes, reason: header.reason, schemaVersion: header.schemaVersion, formatVersion: header.formatVersion, cipher: header.cipher, restoreCompatible }; }
function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback; }
function safeError(error: unknown) { return String(error instanceof Error ? error.message : error).replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://[redacted]@').slice(0, 500); }
function processExit(child: ReturnType<typeof spawn>, stderr: Buffer[]) { return new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Databaseværktøjet fejlede (${code}): ${safeError(Buffer.concat(stderr).toString('utf8'))}`))); }); }
async function runCommand(command: string, args: string[]) { const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], env: process.env }); const stderr: Buffer[] = []; child.stderr.on('data', (chunk: Buffer) => { if (Buffer.concat(stderr).length < 8192) stderr.push(chunk); }); await processExit(child, stderr); }
