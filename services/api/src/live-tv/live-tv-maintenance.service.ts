import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { RunLiveTvMaintenanceDto, UpdateLiveTvAutomationDto } from './live-tv-operations.dto';
import { hasActiveProviderJob, isLiveTvRefreshDue, type MaintenanceJobLike } from './live-tv-maintenance-policy';

const activeLeaseStatuses = ['preparing', 'ready', 'active'] as const;
const activeJobStatuses = ['queued', 'running'] as const;

@Injectable()
export class LiveTvMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveTvMaintenanceService.name);
  private readonly intervalSeconds = clamp(Number.parseInt(process.env.BB_MEDIA_LIVE_TV_MAINTENANCE_INTERVAL_SECONDS ?? '60', 10) || 60, 10, 300);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle().catch((error) => this.logger.error(error instanceof Error ? error.stack : String(error))), this.intervalSeconds * 1_000);
    this.timer.unref();
    void this.runCycle().catch((error) => this.logger.error(error instanceof Error ? error.stack : String(error)));
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async state(actor: AuthenticatedUser) {
    const now = new Date();
    const [providers, leases, jobs] = await Promise.all([
      this.prisma.liveTvProvider.findMany({ where: { accountId: actor.accountId }, orderBy: [{ priority: 'asc' }, { name: 'asc' }], include: {
        connections: { orderBy: [{ priority: 'asc' }, { name: 'asc' }], select: { id: true, name: true, enabled: true, priority: true, maxConcurrentStreams: true, healthStatus: true, lastError: true, lastImportedAt: true } },
        epgSource: { select: { id: true, enabled: true, healthStatus: true, lastError: true, lastImportedAt: true } },
      } }),
      this.prisma.liveTvLease.findMany({ where: { accountId: actor.accountId, status: { in: [...activeLeaseStatuses] }, leaseExpiresAt: { gt: now } }, orderBy: { startedAt: 'desc' }, include: {
        channel: { select: { id: true, name: true, number: true, logoUrl: true } },
        connection: { select: { id: true, name: true, provider: { select: { id: true, name: true } } } },
      } }),
      this.prisma.systemJob.findMany({ where: { accountId: actor.accountId, type: { in: ['live-tv.import', 'live-tv.epg', 'live-tv.stream'] } }, orderBy: { createdAt: 'desc' }, take: 40 }),
    ]);
    return { sampledAt: now, scheduler: { enabled: true, intervalSeconds: this.intervalSeconds, programRetentionHours: 48 }, providers, activeLeases: leases, jobs };
  }

  async updateAutomation(actor: AuthenticatedUser, providerId: string, dto: UpdateLiveTvAutomationDto) {
    const provider = await this.prisma.liveTvProvider.findFirst({ where: { id: providerId, accountId: actor.accountId } });
    if (!provider) throw new NotFoundException({ code: 'live_tv_provider_not_found', message: 'Live TV-udbyderen findes ikke' });
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.liveTvProvider.update({ where: { id: provider.id }, data: dto });
      await this.audit(tx, actor, 'live_tv.automation_update', provider.id, dto as Prisma.InputJsonObject);
      return updated;
    });
  }

  async runNow(actor: AuthenticatedUser, providerId: string, dto: RunLiveTvMaintenanceDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, actor.accountId);
      const provider = await tx.liveTvProvider.findFirst({ where: { id: providerId, accountId: actor.accountId }, include: { epgSource: true } });
      if (!provider) throw new NotFoundException({ code: 'live_tv_provider_not_found', message: 'Live TV-udbyderen findes ikke' });
      if (dto.kind === 'epg' && !provider.epgSource?.enabled) throw new BadRequestException({ code: 'live_tv_epg_not_configured', message: 'Udbyderen har ingen aktiv XMLTV-kilde' });
      const type = dto.kind === 'playlist' ? 'live-tv.import' : 'live-tv.epg';
      const active = await tx.systemJob.findMany({ where: { accountId: actor.accountId, type, status: { in: [...activeJobStatuses] } } });
      const duplicate = active.find((job) => hasActiveProviderJob([job as MaintenanceJobLike], type, provider.id));
      if (duplicate) return { queued: false, deduplicated: true, job: duplicate };
      const job = await tx.systemJob.create({ data: { accountId: actor.accountId, type, status: 'queued', maxAttempts: 3, payload: { providerId: provider.id, requestedBy: actor.sub, trigger: 'manual' } } });
      await tx.liveTvProvider.update({ where: { id: provider.id }, data: dto.kind === 'playlist' ? { lastPlaylistQueuedAt: new Date() } : { lastEpgQueuedAt: new Date() } });
      await this.audit(tx, actor, `live_tv.${dto.kind}_refresh`, provider.id, { jobId: job.id });
      return { queued: true, deduplicated: false, job };
    });
  }

  async terminateLease(actor: AuthenticatedUser, leaseId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAccount(tx, actor.accountId);
      const lease = await tx.liveTvLease.findFirst({ where: { id: leaseId, accountId: actor.accountId } });
      if (!lease) throw new NotFoundException({ code: 'live_tv_lease_not_found', message: 'Live TV-sessionen findes ikke' });
      if (!activeLeaseStatuses.includes(lease.status as typeof activeLeaseStatuses[number])) return { released: false, status: lease.status };
      const now = new Date();
      await tx.liveTvLease.update({ where: { id: lease.id }, data: { status: 'released', runtimeState: 'admin_stopped', endedAt: now, leaseExpiresAt: now, lastError: 'admin_terminated' } });
      if (lease.jobId) await tx.systemJob.updateMany({ where: { id: lease.jobId, status: { in: [...activeJobStatuses] } }, data: { status: 'cancelled' } });
      await this.audit(tx, actor, 'live_tv.lease_terminate', lease.id, { userId: lease.userId, channelId: lease.channelId });
      return { released: true, status: 'released' };
    });
  }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      const accounts = await this.prisma.liveTvProvider.findMany({ where: { enabled: true, autoRefreshEnabled: true }, distinct: ['accountId'], select: { accountId: true } });
      for (const { accountId } of accounts) await this.runAccountCycle(accountId);
    } finally { this.running = false; }
  }

  private async runAccountCycle(accountId: string) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('bbmedia:live-tv-maintenance'), hashtext(CAST(${accountId} AS text))) AS acquired`;
      if (!rows[0]?.acquired) return;
      const now = new Date();
      const expired = await tx.liveTvLease.findMany({ where: { accountId, status: { in: [...activeLeaseStatuses] }, leaseExpiresAt: { lte: now } }, select: { id: true, jobId: true } });
      if (expired.length) {
        await tx.liveTvLease.updateMany({ where: { id: { in: expired.map((lease) => lease.id) } }, data: { status: 'expired', runtimeState: 'expired', endedAt: now } });
        const jobIds = expired.flatMap((lease) => lease.jobId ? [lease.jobId] : []);
        if (jobIds.length) await tx.systemJob.updateMany({ where: { id: { in: jobIds }, status: { in: [...activeJobStatuses] } }, data: { status: 'cancelled' } });
      }
      await tx.liveTvProgram.deleteMany({ where: { accountId, endsAt: { lt: new Date(now.getTime() - 48 * 60 * 60_000) } } });
      const [providers, activeJobs] = await Promise.all([
        tx.liveTvProvider.findMany({ where: { accountId, enabled: true, autoRefreshEnabled: true }, include: { epgSource: { select: { enabled: true } } } }),
        tx.systemJob.findMany({ where: { accountId, type: { in: ['live-tv.import', 'live-tv.epg'] }, status: { in: [...activeJobStatuses] } } }),
      ]);
      const jobSnapshots = activeJobs as MaintenanceJobLike[];
      for (const provider of providers) {
        if (isLiveTvRefreshDue(provider.lastPlaylistQueuedAt, provider.playlistRefreshMinutes, now) && !hasActiveProviderJob(jobSnapshots, 'live-tv.import', provider.id)) {
          const job = await tx.systemJob.create({ data: { accountId, type: 'live-tv.import', status: 'queued', maxAttempts: 3, payload: { providerId: provider.id, trigger: 'scheduled' } } });
          jobSnapshots.push(job as MaintenanceJobLike);
          await tx.liveTvProvider.update({ where: { id: provider.id }, data: { lastPlaylistQueuedAt: now } });
        }
        if (provider.epgSource?.enabled && isLiveTvRefreshDue(provider.lastEpgQueuedAt, provider.epgRefreshMinutes, now) && !hasActiveProviderJob(jobSnapshots, 'live-tv.epg', provider.id)) {
          const job = await tx.systemJob.create({ data: { accountId, type: 'live-tv.epg', status: 'queued', maxAttempts: 3, payload: { providerId: provider.id, trigger: 'scheduled' } } });
          jobSnapshots.push(job as MaintenanceJobLike);
          await tx.liveTvProvider.update({ where: { id: provider.id }, data: { lastEpgQueuedAt: now } });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private lockAccount(tx: Prisma.TransactionClient, accountId: string) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bbmedia:live-tv-maintenance'), hashtext(CAST(${accountId} AS text)))::text AS lock_result`;
  }

  private audit(tx: Prisma.TransactionClient, actor: AuthenticatedUser, action: string, resourceId: string, details: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: actor.profileId, correlationId: correlationId(), action, outcome: 'allowed', code: action.replaceAll('.', '_'), details: { resourceId, ...details } } });
  }
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
