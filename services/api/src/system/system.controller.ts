import { Body, Controller, Delete, Get, Header, Headers, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BB_MEDIA_VERSION, type AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { CurrentUser, Public, Roles } from '../common/auth';
import { UpdaterService } from './updater.service';
import { SetUpdateBranchDto, UpdateServerSettingsDto } from './system.dto';
import { SaveMetadataSettingsDto } from './metadata-settings.dto';
import { metadataSettingsStatus, saveMetadataSettings } from './metadata-settings';
import { resolveTranscoderStatus } from './transcoder-status';
import { inspectLibraryWatcherPaths, resolveLibraryWatcherStatus } from './library-watcher-status';
import { jobPayload, jobReferences, presentJobProgress } from './system-jobs';
import { collectDefaultMetrics, register } from 'prom-client';
import { DiagnosticsService } from './diagnostics.service';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import type { Request, Response } from 'express';
import { BackupService } from './backup.service';
import { RestoreBackupDto } from './system.dto';
import { readCorsOrigins } from '../config/environment';

type CpuSnapshot = { idle: number; total: number };

function cpuSnapshot(): CpuSnapshot {
  return cpus().reduce(
    (result, cpu) => {
      const times = Object.values(cpu.times);
      return {
        idle: result.idle + cpu.times.idle,
        total: result.total + times.reduce((sum, value) => sum + value, 0),
      };
    },
    { idle: 0, total: 0 },
  );
}

let previousCpu = cpuSnapshot();

function serverStatsSnapshot() {
  const currentCpu = cpuSnapshot();
  const totalDelta = currentCpu.total - previousCpu.total;
  const idleDelta = currentCpu.idle - previousCpu.idle;
  previousCpu = currentCpu;
  const memoryTotalBytes = totalmem();
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - freemem());
  return {
    cpuPercent: totalDelta > 0
      ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
      : 0,
    memoryUsedBytes,
    memoryTotalBytes,
    memoryPercent: memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0,
    loadAverage: loadavg(),
    uptimeSeconds: Math.floor(uptime()),
    sampledAt: new Date().toISOString(),
  };
}

let metricsInitialized = false;
if (!metricsInitialized) {
  collectDefaultMetrics({ prefix: 'bb_media_' });
  metricsInitialized = true;
}

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly updater: UpdaterService,
    private readonly diagnosticsService: DiagnosticsService,
    private readonly backups: BackupService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'boltbytes-media-api', version: BB_MEDIA_VERSION, timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready() {
    const [, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    return { status: redis === 'PONG' ? 'ready' : 'degraded', database: 'ready', redis };
  }

  @Get('metrics')
  @Roles('admin')
  @Header('content-type', register.contentType)
  metrics() {
    return register.metrics();
  }

  @Get('diagnostics')
  @Roles('admin', 'operator')
  diagnostics(@CurrentUser() actor: AuthenticatedUser) {
    return this.diagnosticsService.snapshot(actor.accountId);
  }

  @Get('stats')
  @Roles('admin', 'operator')
  async stats(@CurrentUser() actor: AuthenticatedUser) {
    const now = new Date();
    const [persistedStatus, running, queued] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: {
          accountId_key: {
            accountId: actor.accountId,
            key: 'runtime.transcoder.status',
          },
        },
        select: { value: true },
      }),
      this.prisma.systemJob.count({
        where: {
          accountId: actor.accountId,
          type: 'playback.transcode',
          status: 'running',
          leaseExpiresAt: { gt: now },
        },
      }),
      this.prisma.systemJob.count({
        where: {
          accountId: actor.accountId,
          type: 'playback.transcode',
          status: 'queued',
        },
      }),
    ]);
    return {
      ...serverStatsSnapshot(),
      transcoder: resolveTranscoderStatus(persistedStatus?.value, { running, queued }, now),
    };
  }

  @Get('backups')
  @Roles('admin')
  backupsList(@CurrentUser() actor: AuthenticatedUser) {
    return this.backups.list(actor);
  }

  @Post('backups')
  @Roles('admin')
  createBackup(@CurrentUser() actor: AuthenticatedUser) {
    return this.backups.create(actor);
  }

  @Post('backups/import')
  @Roles('admin')
  importBackup(@CurrentUser() actor: AuthenticatedUser, @Req() request: Request, @Headers('content-length') contentLength: string | undefined) {
    return this.backups.import(actor, request, contentLength);
  }

  @Get('backups/:filename/download')
  @Roles('admin')
  async downloadBackup(@CurrentUser() actor: AuthenticatedUser, @Param('filename') filename: string, @Res() response: Response) {
    const file = await this.backups.download(actor, filename);
    response.setHeader('Content-Type', 'application/vnd.boltbytes.backup');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.setHeader('Content-Length', String(file.size));
    file.stream.pipe(response);
  }

  @Delete('backups/:filename')
  @Roles('admin')
  deleteBackup(@CurrentUser() actor: AuthenticatedUser, @Param('filename') filename: string) {
    return this.backups.remove(actor, filename);
  }

  @Post('backups/:filename/restore-plan')
  @Roles('admin')
  restorePlan(@CurrentUser() actor: AuthenticatedUser, @Param('filename') filename: string) {
    return this.backups.restorePlan(actor, filename);
  }

  @Post('backups/:filename/restore')
  @Roles('admin')
  restoreBackup(@CurrentUser() actor: AuthenticatedUser, @Param('filename') filename: string, @Body() input: RestoreBackupDto) {
    return this.backups.restore(actor, filename, input.challengeToken, input.confirmation);
  }

  @Get('jobs')
  @Roles('admin', 'operator')
  async jobs(@CurrentUser() actor: AuthenticatedUser) {
    const jobs = await this.prisma.systemJob.findMany({
      where: { accountId: actor.accountId },
      include: { attempts: { orderBy: { number: 'desc' }, take: 1, select: { number: true, status: true, error: true, startedAt: true, endedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const references = jobs.map((job) => jobReferences(job.payload));
    const libraryIds = [...new Set(references.flatMap((reference) => reference.libraryId ? [reference.libraryId] : []))];
    const mediaIds = [...new Set(references.flatMap((reference) => reference.mediaId ? [reference.mediaId] : []))];
    const [libraries, media, scans] = await Promise.all([
      this.prisma.library.findMany({ where: { accountId: actor.accountId, id: { in: libraryIds } }, select: { id: true, name: true } }),
      this.prisma.mediaItem.findMany({ where: { accountId: actor.accountId, id: { in: mediaIds } }, select: { id: true, title: true, seriesDisplayTitle: true, seriesTitle: true, seasonNumber: true, episodeNumber: true } }),
      this.prisma.libraryScan.findMany({ where: { accountId: actor.accountId, jobId: { in: jobs.map((job) => job.id) } }, select: { jobId: true, filesSeen: true, filesCreated: true, filesUpdated: true, errors: true } }),
    ]);
    const libraryNames = new Map(libraries.map((library) => [library.id, library.name]));
    const mediaNames = new Map(media.map((item) => [item.id, item.episodeNumber !== null ? `${item.seriesDisplayTitle ?? item.seriesTitle ?? item.title} · S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}` : item.title]));
    const scansByJob = new Map(scans.flatMap((scan) => scan.jobId ? [[scan.jobId, scan] as const] : []));
    const items = jobs.map((job, index) => {
      const payload = jobPayload(job.payload);
      const reference = references[index]!;
      const scan = scansByJob.get(job.id);
      const storedProgress = presentJobProgress(job.payload, job.status);
      const progress = scan && job.status === 'running' ? { ...storedProgress, current: scan.filesSeen, message: `${scan.filesSeen} filer set · ${scan.filesCreated} nye · ${scan.filesUpdated} opdateret · ${scan.errors} fejl` } : storedProgress;
      const mediaType = payload.mediaType === 'movie' ? 'film' : payload.mediaType === 'series' ? 'serier' : 'alle medier';
      const target = reference.libraryId ? libraryNames.get(reference.libraryId) ?? 'Ukendt bibliotek' : reference.mediaId ? mediaNames.get(reference.mediaId) ?? 'Ukendt medie' : job.type === 'media.metadata' ? `Metadata · ${mediaType}` : job.type === 'media.playback-assets' ? 'Playback-analyse' : 'Serveropgave';
      return {
        id: job.id, type: job.type, status: job.status, target, progress,
        attemptCount: job.attemptCount, maxAttempts: job.maxAttempts,
        error: job.attempts[0]?.error ?? null,
        createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), availableAt: job.availableAt.toISOString(),
        startedAt: job.lockedAt?.toISOString() ?? job.attempts[0]?.startedAt.toISOString() ?? null,
        finishedAt: job.attempts[0]?.endedAt?.toISOString() ?? null,
      };
    });
    const count = (status: string) => items.filter((item) => item.status === status).length;
    return { summary: { total: items.length, queued: count('queued'), running: count('running'), completed: count('completed'), failed: count('failed') }, items, sampledAt: new Date().toISOString() };
  }

  @Get('library-watcher/status')
  @Roles('admin', 'operator')
  async libraryWatcherStatus(@CurrentUser() actor: AuthenticatedUser) {
    const [persisted, libraries] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { accountId_key: { accountId: actor.accountId, key: 'runtime.library-watcher.status' } },
        select: { value: true },
      }),
      this.prisma.library.findMany({
        where: { accountId: actor.accountId },
        select: {
          id: true,
          name: true,
          autoScanEnabled: true,
          scanIntervalMinutes: true,
          lastScheduledScanAt: true,
          paths: { select: { path: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return resolveLibraryWatcherStatus(persisted?.value, libraries);
  }

  @Post('library-watcher/test')
  @Roles('admin')
  async testLibraryWatcher(@CurrentUser() actor: AuthenticatedUser) {
    const status = await this.libraryWatcherStatus(actor);
    const paths = await inspectLibraryWatcherPaths(status.monitoredPaths);
    const healthy = status.state === 'active' && paths.length > 0 && paths.every((entry) => entry.readable && entry.directory);
    const testedAt = new Date().toISOString();
    await this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId,
        correlationId: 'library-watcher-test',
        action: 'system.library_watcher_tested',
        outcome: healthy ? 'allowed' : 'denied',
        code: healthy ? 'library_watcher_healthy' : 'library_watcher_unhealthy',
        details: { state: status.state, configuredPaths: paths.length, failedPaths: paths.filter((entry) => entry.error).length, testedAt },
      },
    });
    return {
      healthy,
      testedAt,
      state: status.state,
      message: healthy
        ? `Watcheren er aktiv og kan læse ${paths.length} konfigurerede mapper.`
        : paths.length === 0
          ? 'Ingen mapper er aktiveret til automatisk scanning.'
          : status.state !== 'active'
            ? `Workerens watcher er ${status.state}. Kontroller workerstatus og miljøkonfiguration.`
            : 'En eller flere mapper kan ikke læses fra API-containeren.',
      paths,
    };
  }

  @Get('errors')
  @Roles('admin')
  async errors(@CurrentUser() actor: AuthenticatedUser) {
    const [scans, attempts, dismissedSetting] = await Promise.all([
      this.prisma.libraryScan.findMany({
        where: {
          accountId: actor.accountId,
          OR: [{ status: 'failed' }, { errors: { gt: 0 } }],
        },
        include: { library: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.jobAttempt.findMany({
        where: { status: 'failed', job: { accountId: actor.accountId } },
        include: { job: { select: { id: true, type: true } } },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
      this.prisma.systemSetting.findUnique({
        where: {
          accountId_key: {
            accountId: actor.accountId,
            key: 'notifications.dismissedBefore',
          },
        },
        select: { value: true },
      }),
    ]);
    const dismissedBefore = typeof dismissedSetting?.value === 'string'
      ? Date.parse(dismissedSetting.value)
      : 0;
    return [
      ...scans.map((scan) => ({
        id: `scan:${scan.id}`,
        severity: scan.status === 'failed' ? 'error' : 'warning',
        source: 'library-scanner',
        code: scan.status === 'failed' ? 'library_scan_failed' : 'library_scan_partial',
        message: scan.error ?? `${scan.errors} file(s) could not be processed`,
        timestamp: (scan.finishedAt ?? scan.createdAt).toISOString(),
        details: {
          libraryId: scan.library.id,
          libraryName: scan.library.name,
          filesSeen: scan.filesSeen,
          filesCreated: scan.filesCreated,
          filesUpdated: scan.filesUpdated,
          filesMissing: scan.filesMissing,
          errors: scan.errors,
        },
      })),
      ...attempts.map((attempt) => ({
        id: `job:${attempt.id}`,
        severity: 'error',
        source: 'worker',
        code: 'job_attempt_failed',
        message: attempt.error ?? 'Worker job attempt failed without an error message',
        timestamp: (attempt.endedAt ?? attempt.startedAt).toISOString(),
        details: {
          jobId: attempt.job.id,
          jobType: attempt.job.type,
          attempt: attempt.number,
        },
      })),
    ]
      .filter((entry) => Date.parse(entry.timestamp) > dismissedBefore)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, 75);
  }

  @Delete('errors')
  @Roles('admin')
  async clearErrors(@CurrentUser() actor: AuthenticatedUser) {
    const clearedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.systemSetting.upsert({
        where: {
          accountId_key: {
            accountId: actor.accountId,
            key: 'notifications.dismissedBefore',
          },
        },
        create: {
          accountId: actor.accountId,
          key: 'notifications.dismissedBefore',
          value: clearedAt.toISOString(),
        },
        update: { value: clearedAt.toISOString() },
      }),
      this.prisma.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId,
          correlationId: 'system-errors',
          action: 'system.notifications_cleared',
          outcome: 'allowed',
          code: 'notifications_cleared',
          details: { clearedAt: clearedAt.toISOString() },
        },
      }),
    ]);
    return { clearedAt: clearedAt.toISOString() };
  }

  @Get('server-settings')
  @Roles('admin', 'operator')
  async serverSettings(@CurrentUser() actor: AuthenticatedUser) {
    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { serverName: true, externalUrl: true, language: true, timezone: true },
    });
    const environmentUrl = process.env.BB_MEDIA_PUBLIC_URL?.trim() || null;
    const effectivePublicUrl = environmentUrl ?? account?.externalUrl ?? null;
    return {
      ...account,
      effectivePublicUrl,
      publicUrlSource: environmentUrl ? 'environment' : account?.externalUrl ? 'account' : 'unset',
      httpsReady: effectivePublicUrl?.startsWith('https://') ?? false,
      castReady: Boolean(effectivePublicUrl?.startsWith('https://') && !/localhost|127\.0\.0\.1/i.test(effectivePublicUrl)),
      corsOrigins: readCorsOrigins(process.env.CORS_ORIGIN, process.env.BB_MEDIA_PUBLIC_URL),
    };
  }

  @Patch('server-settings')
  @Roles('admin')
  async updateServerSettings(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateServerSettingsDto) {
    const account = await this.prisma.account.update({
      where: { id: actor.accountId },
      data: {
        ...(dto.serverName ? { serverName: dto.serverName.trim() } : {}),
        ...(dto.externalUrl ? { externalUrl: dto.externalUrl.trim() } : {}),
        ...(dto.language ? { language: dto.language } : {}),
        ...(dto.timezone ? { timezone: dto.timezone.trim() } : {}),
      },
      select: { serverName: true, externalUrl: true, language: true, timezone: true },
    });
    await this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId,
        correlationId: 'system-settings',
        action: 'system.server_settings_updated',
        outcome: 'allowed',
        code: 'server_settings_updated',
        details: { fields: Object.keys(dto) },
      },
    });
    return account;
  }

  @Get('metadata/settings')
  @Roles('admin')
  metadataSettings(@CurrentUser() actor: AuthenticatedUser) {
    return metadataSettingsStatus(this.prisma, actor.accountId);
  }

  @Put('metadata/settings')
  @Roles('admin')
  saveMetadataSettings(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SaveMetadataSettingsDto) {
    return saveMetadataSettings(this.prisma, actor.accountId, dto);
  }

  @Get('update/status')
  @Roles('admin')
  updateStatus(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.status(actor.accountId);
  }

  @Get('update/progress')
  @Roles('admin')
  updateProgress(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.progress(actor.accountId);
  }

  @Post('update/check')
  @Roles('admin')
  updateCheck(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.status(actor.accountId);
  }

  @Get('update/branches')
  @Roles('admin')
  updateBranches(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.branches(actor.accountId);
  }

  @Post('update/branch')
  @Roles('admin')
  updateBranch(@CurrentUser() actor: AuthenticatedUser, @Body() dto: SetUpdateBranchDto) {
    return this.updater.selectBranch(actor.accountId, dto.branch);
  }

  @Post('update/apply')
  @Roles('admin')
  updateApply(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.apply(actor.accountId);
  }

  @Post('update/reset')
  @Roles('admin')
  updateReset(@CurrentUser() actor: AuthenticatedUser) {
    return this.updater.reset(actor.accountId);
  }
}
