import { Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { access, stat, statfs } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { performance } from 'node:perf_hooks';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { type DiagnosticCheck, storageDiagnosticState, summarizeDiagnostics } from './diagnostics-health';
import { resolveLibraryWatcherStatus } from './library-watcher-status';
import { resolveTranscoderStatus } from './transcoder-status';
import { UpdaterService } from './updater.service';

type TimedResult<T> = { ok: true; value: T; latencyMs: number } | { ok: false; error: string; latencyMs: number };

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly updater: UpdaterService,
  ) {}

  async snapshot(accountId: string) {
    const sampledAt = new Date();
    const [database, redis] = await Promise.all([
      timed(async () => this.prisma.$queryRaw`SELECT 1`),
      timed(() => this.redis.ping()),
    ]);
    const checks: DiagnosticCheck[] = [
      database.ok
        ? { id: 'postgresql', group: 'Kernetjenester', label: 'PostgreSQL', state: 'ok', summary: 'Databaseforbindelsen svarer.', latencyMs: database.latencyMs }
        : { id: 'postgresql', group: 'Kernetjenester', label: 'PostgreSQL', state: 'error', summary: database.error, latencyMs: database.latencyMs },
      redis.ok && redis.value === 'PONG'
        ? { id: 'redis', group: 'Kernetjenester', label: 'Redis', state: 'ok', summary: 'Cache og sessions svarer.', latencyMs: redis.latencyMs }
        : { id: 'redis', group: 'Kernetjenester', label: 'Redis', state: 'error', summary: redis.ok ? `Uventet svar: ${redis.value}` : redis.error, latencyMs: redis.latencyMs },
    ];

    if (!database.ok) {
      const summary = summarizeDiagnostics(checks);
      return { ...summary, checks, sampledAt: sampledAt.toISOString(), runtime: runtimeSnapshot() };
    }

    const dayAgo = new Date(sampledAt.getTime() - 86_400_000);
    const [
      roots,
      libraries,
      settings,
      jobGroups,
      oldestQueued,
      staleJobs,
      recentFailures,
      activeSessions,
      activeReservations,
      transcodeRunning,
      transcodeQueued,
      account,
      updater,
    ] = await Promise.all([
      this.prisma.storageRoot.findMany({ where: { accountId }, select: { id: true, label: true, mountPath: true, isReadOnly: true }, orderBy: { label: 'asc' } }),
      this.prisma.library.findMany({ where: { accountId }, select: { id: true, name: true, autoScanEnabled: true, scanIntervalMinutes: true, lastScheduledScanAt: true, paths: { select: { path: true } } } }),
      this.prisma.systemSetting.findMany({ where: { accountId, key: { in: ['runtime.library-watcher.status', 'runtime.transcoder.status'] } }, select: { key: true, value: true } }),
      this.prisma.systemJob.groupBy({ by: ['status'], where: { accountId }, _count: { _all: true } }),
      this.prisma.systemJob.findFirst({ where: { accountId, status: 'queued' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, type: true } }),
      this.prisma.systemJob.count({ where: { accountId, status: 'running', leaseExpiresAt: { lt: sampledAt } } }),
      this.prisma.jobAttempt.count({ where: { status: 'failed', startedAt: { gte: dayAgo }, job: { accountId } } }),
      this.prisma.playbackSession.count({ where: { accountId, status: { in: ['reserving', 'active'] }, leaseExpiresAt: { gt: sampledAt } } }),
      this.prisma.streamReservation.count({ where: { accountId, releasedAt: null } }),
      this.prisma.systemJob.count({ where: { accountId, type: 'playback.transcode', status: 'running', leaseExpiresAt: { gt: sampledAt } } }),
      this.prisma.systemJob.count({ where: { accountId, type: 'playback.transcode', status: 'queued' } }),
      this.prisma.account.findUnique({ where: { id: accountId }, select: { externalUrl: true, serverName: true } }),
      this.updater.diagnostics(accountId),
    ]);

    const setting = new Map(settings.map((entry) => [entry.key, entry.value]));
    const watcher = resolveLibraryWatcherStatus(setting.get('runtime.library-watcher.status'), libraries, sampledAt);
    checks.push({
      id: 'library-watcher',
      group: 'Workers og kø',
      label: 'Bibliotek-watcher',
      state: watcher.state === 'active' || watcher.state === 'idle' ? 'ok' : watcher.state === 'degraded' || watcher.state === 'disabled' ? 'warning' : 'error',
      summary: watcher.state === 'active' ? `${watcher.watchedLibraryCount} biblioteker overvåges med ${watcher.mode}.` : watcher.state === 'idle' ? 'Ingen biblioteker er aktiveret til automatisk scanning.' : watcher.state === 'disabled' ? 'Filesystem-watcheren er deaktiveret.' : watcher.state === 'degraded' ? watcher.lastError?.message ?? 'Watcher-konfigurationen matcher ikke de aktive biblioteker.' : 'Watcher-workerens heartbeat er udløbet.',
      details: { mode: watcher.mode, watched: watcher.watchedLibraryCount, configured: watcher.configuredLibraryCount, workerId: watcher.workerId, lastHeartbeatAt: watcher.lastHeartbeatAt },
    });

    const transcoder = resolveTranscoderStatus(setting.get('runtime.transcoder.status'), { running: transcodeRunning, queued: transcodeQueued }, sampledAt);
    checks.push({
      id: 'transcoder',
      group: 'Workers og kø',
      label: 'Transcoder',
      state: transcoder.available ? 'ok' : transcodeQueued > 0 ? 'error' : 'warning',
      summary: transcoder.available ? `${transcoder.backend === 'nvenc' ? 'NVENC' : 'Software'} worker klar, ${transcodeRunning}/${transcoder.maxConcurrent} aktive.` : transcodeQueued > 0 ? 'Transcode-køen venter, men workerens heartbeat er offline.' : 'Transcoder-workerens heartbeat er offline; Direct Play er fortsat muligt.',
      details: { backend: transcoder.backend, encoder: transcoder.encoder, running: transcodeRunning, queued: transcodeQueued, lastError: transcoder.lastError, updatedAt: transcoder.updatedAt },
    });

    const queueCounts = Object.fromEntries(jobGroups.map((entry) => [entry.status, entry._count._all])) as Record<string, number>;
    const oldestAgeSeconds = oldestQueued ? Math.max(0, Math.round((sampledAt.getTime() - oldestQueued.createdAt.getTime()) / 1000)) : 0;
    checks.push({
      id: 'job-queue',
      group: 'Workers og kø',
      label: 'Jobkø og leases',
      state: staleJobs > 0 ? 'error' : oldestAgeSeconds > 900 || recentFailures > 10 ? 'warning' : 'ok',
      summary: staleJobs > 0 ? `${staleJobs} jobs har en udløbet worker-lease.` : `${queueCounts.queued ?? 0} i kø, ${queueCounts.running ?? 0} kører og ${recentFailures} fejlede forsøg de seneste 24 timer.`,
      details: { queued: queueCounts.queued ?? 0, running: queueCounts.running ?? 0, failedJobs: queueCounts.failed ?? 0, staleLeases: staleJobs, recentFailedAttempts: recentFailures, oldestQueuedType: oldestQueued?.type ?? null, oldestQueuedAgeSeconds: oldestAgeSeconds },
    });

    checks.push({
      id: 'stream-reservations',
      group: 'Playback',
      label: 'Streams og reservationer',
      state: activeReservations === activeSessions ? 'ok' : 'warning',
      summary: activeReservations === activeSessions ? `${activeSessions} aktive streams med matchende reservationer.` : `${activeSessions} aktive sessions, men ${activeReservations} åbne reservationer. Lease-cleanup bør udligne forskellen.`,
      details: { activeSessions, activeReservations },
    });

    const rootChecks = await Promise.all(roots.map((root) => inspectStorageRoot(root)));
    checks.push(...rootChecks);
    if (roots.length === 0) checks.push({ id: 'storage-none', group: 'Storage', label: 'Storage roots', state: 'error', summary: 'Ingen storage roots er konfigureret.' });

    const effectivePublicUrl = process.env.BB_MEDIA_PUBLIC_URL?.trim() || account?.externalUrl?.trim() || null;
    const securePublicUrl = Boolean(effectivePublicUrl?.startsWith('https://') && !/localhost|127\.0\.0\.1/i.test(effectivePublicUrl));
    const corsOrigins = (process.env.CORS_ORIGIN ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    checks.push({
      id: 'public-url',
      group: 'Netværk og sikkerhed',
      label: 'Public URL og Cast',
      state: securePublicUrl && effectivePublicUrl && corsOrigins.includes(effectivePublicUrl) ? 'ok' : securePublicUrl ? 'warning' : 'error',
      summary: !securePublicUrl ? 'En offentlig HTTPS-URL mangler; Cast og eksterne stream-URLer er ikke sikre.' : corsOrigins.includes(effectivePublicUrl!) ? `${effectivePublicUrl} er klar til HTTPS, CORS og Cast.` : 'Public URL bruger HTTPS, men findes ikke i CORS_ORIGIN.',
      details: { serverName: account?.serverName ?? null, effectivePublicUrl, corsConfigured: Boolean(effectivePublicUrl && corsOrigins.includes(effectivePublicUrl)), castReady: securePublicUrl },
    });

    const secretsReady = Boolean(process.env.JWT_SECRET?.trim() && process.env.ENCRYPTION_KEY?.trim());
    checks.push({
      id: 'secrets',
      group: 'Netværk og sikkerhed',
      label: 'Serverhemmeligheder',
      state: secretsReady ? 'ok' : 'error',
      summary: secretsReady ? 'JWT- og krypteringsnøgler er indlæst.' : 'JWT_SECRET eller ENCRYPTION_KEY mangler.',
      details: { jwtConfigured: Boolean(process.env.JWT_SECRET?.trim()), encryptionConfigured: Boolean(process.env.ENCRYPTION_KEY?.trim()) },
    });

    checks.push({
      id: 'updater',
      group: 'Opdatering',
      label: 'Server-updater',
      state: updater.enabled && updater.configured && updater.restartMode !== 'none' ? 'ok' : updater.enabled ? 'warning' : 'warning',
      summary: !updater.enabled ? 'Updateren er deaktiveret.' : !updater.configured ? 'Updater-repository er ikke monteret som et Git-worktree.' : updater.restartMode === 'none' ? 'Updateren kan hente kode, men automatisk genstart er deaktiveret.' : `Updateren følger ${updater.remote}/${updater.branch} og genstarter med ${updater.restartMode}.`,
      details: { enabled: updater.enabled, configured: updater.configured, branch: updater.branch, remote: updater.remote, restartMode: updater.restartMode, progressState: updater.progress.state, progressPhase: updater.progress.phase },
    });

    const runtime = runtimeSnapshot();
    checks.push({
      id: 'host-runtime',
      group: 'Kernetjenester',
      label: 'CPU og RAM',
      state: runtime.memoryPercent >= 95 || runtime.loadPerCpu >= 2 ? 'error' : runtime.memoryPercent >= 85 || runtime.loadPerCpu >= 1 ? 'warning' : 'ok',
      summary: `${runtime.cpuCount} CPU-tråde, load ${runtime.loadAverage[0].toFixed(2)} og ${runtime.memoryPercent.toFixed(1)}% RAM i brug.`,
      details: { cpuCount: runtime.cpuCount, load1m: runtime.loadAverage[0], load5m: runtime.loadAverage[1], memoryUsedBytes: runtime.memoryUsedBytes, memoryTotalBytes: runtime.memoryTotalBytes, uptimeSeconds: runtime.uptimeSeconds },
    });

    return { ...summarizeDiagnostics(checks), checks, sampledAt: sampledAt.toISOString(), runtime };
  }
}

async function inspectStorageRoot(root: { id: string; label: string; mountPath: string; isReadOnly: boolean }): Promise<DiagnosticCheck> {
  const started = performance.now();
  try {
    await access(root.mountPath, constants.R_OK);
    const [details, filesystem] = await Promise.all([stat(root.mountPath), statfs(root.mountPath)]);
    if (!details.isDirectory()) throw new Error('Storage root er ikke en mappe');
    const totalBytes = filesystem.bsize * filesystem.blocks;
    const freeBytes = filesystem.bsize * filesystem.bavail;
    const usedPercent = totalBytes > 0 ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
    return {
      id: `storage:${root.id}`,
      group: 'Storage',
      label: root.label,
      state: storageDiagnosticState(freeBytes, usedPercent),
      summary: `${root.mountPath} er læsbar, ${formatBytes(freeBytes)} fri af ${formatBytes(totalBytes)}.`,
      latencyMs: elapsed(started),
      details: { path: root.mountPath, readOnly: root.isReadOnly, totalBytes, freeBytes, usedPercent: Number(usedPercent.toFixed(1)) },
    };
  } catch (error) {
    return { id: `storage:${root.id}`, group: 'Storage', label: root.label, state: 'error', summary: error instanceof Error ? error.message : 'Mountet kan ikke læses.', latencyMs: elapsed(started), details: { path: root.mountPath, readOnly: root.isReadOnly } };
  }
}

function runtimeSnapshot() {
  const memoryTotalBytes = totalmem();
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - freemem());
  const cpuCount = Math.max(1, cpus().length);
  const averages = loadavg();
  const loadAverage: [number, number, number] = [averages[0] ?? 0, averages[1] ?? 0, averages[2] ?? 0];
  return { cpuCount, loadAverage, loadPerCpu: loadAverage[0] / cpuCount, memoryUsedBytes, memoryTotalBytes, memoryPercent: memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0, uptimeSeconds: Math.floor(uptime()) };
}

async function timed<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const started = performance.now();
  try { return { ok: true, value: await operation(), latencyMs: elapsed(started) }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Ukendt forbindelsesfejl', latencyMs: elapsed(started) }; }
}

function elapsed(started: number) { return Number((performance.now() - started).toFixed(1)); }
function formatBytes(value: number) { return value >= 1024 ** 4 ? `${(value / 1024 ** 4).toFixed(1)} TB` : `${(value / 1024 ** 3).toFixed(1)} GB`; }
