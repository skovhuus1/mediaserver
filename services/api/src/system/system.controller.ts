import { Body, Controller, Get, Header, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { CurrentUser, Public, Roles } from '../common/auth';
import { UpdaterService } from './updater.service';
import { SetUpdateBranchDto, UpdateServerSettingsDto } from './system.dto';
import { SaveMetadataSettingsDto } from './metadata-settings.dto';
import { metadataSettingsStatus, saveMetadataSettings } from './metadata-settings';
import { collectDefaultMetrics, register } from 'prom-client';

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
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'boltbytes-media-api', version: '0.1.0', timestamp: new Date().toISOString() };
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

  @Get('errors')
  @Roles('admin')
  async errors(@CurrentUser() actor: AuthenticatedUser) {
    const [scans, attempts] = await Promise.all([
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
    ]);
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
    ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 75);
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
      corsOrigins: (process.env.CORS_ORIGIN ?? '').split(',').map((value) => value.trim()).filter(Boolean),
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
}
