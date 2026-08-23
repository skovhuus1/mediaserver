import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { chooseLiveTvMethod, selectLiveTvSource, type LiveTvMethod, type LiveTvSourceCandidate } from './live-tv-policy';
import type { LiveTvAuthorizeDto, LiveTvHeartbeatDto } from './live-tv.dto';

const activeStatuses = ['preparing', 'ready', 'active'] as const;
type LiveTvLeaseWithChannel = Prisma.LiveTvLeaseGetPayload<{ include: { channel: true } }>;

@Injectable()
export class LiveTvPlaybackService {
  private readonly leaseSeconds = Math.max(30, Math.min(300, Number.parseInt(process.env.SESSION_LEASE_SECONDS ?? '90', 10) || 90));
  constructor(private readonly prisma: PrismaService) {}

  async authorize(actor: AuthenticatedUser, dto: LiveTvAuthorizeDto) {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = hashToken(token);
    const entitlements = await this.entitlements(actor);
    if (dto.isCastSession && !entitlements.allowChromecast) {
      throw new ForbiddenException({ code: 'live_tv_cast_not_allowed', message: 'Det aktive abonnement tillader ikke Chromecast' });
    }
    const lease = await this.prisma.$transaction(async (tx) => {
      await this.lockPool(tx, actor.accountId);
      await this.expireLeases(tx, actor.accountId);
      await this.assertPlanCapacity(tx, actor, entitlements.maxConcurrentStreams);
      const allocation = await this.allocate(tx, actor, dto.channelId, entitlements, dto.preferredMethod ?? 'auto');
      const expiresAt = new Date(Date.now() + this.leaseSeconds * 1_000);
      const created = await tx.liveTvLease.create({ data: {
        accountId: actor.accountId, userId: actor.sub, profileId: entitlements.profileId, deviceId: entitlements.deviceId,
        channelId: dto.channelId, sourceId: allocation.source.sourceId, connectionId: allocation.source.connectionId,
        status: allocation.method === 'direct_play' ? 'ready' : 'preparing', method: allocation.method,
        streamTokenHash: tokenHash, isCastSession: dto.isCastSession ?? false, leaseExpiresAt: expiresAt,
      }, include: { channel: true } });
      return this.queueStreamJob(tx, created, allocation.method, entitlements.allowVideoTranscode);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.response(lease, token);
  }

  async switchChannel(actor: AuthenticatedUser, leaseId: string, channelId: string, token: string, preferredMethod = 'auto') {
    const entitlements = await this.entitlements(actor);
    const lease = await this.prisma.$transaction(async (tx) => {
      await this.lockPool(tx, actor.accountId);
      await this.expireLeases(tx, actor.accountId);
      const current = await tx.liveTvLease.findFirst({ where: { id: leaseId, accountId: actor.accountId, userId: actor.sub, profileId: entitlements.profileId }, include: { channel: true } });
      this.assertToken(current, token);
      if (!current || !activeStatuses.includes(current.status as typeof activeStatuses[number])) {
        throw new ConflictException({ code: 'live_tv_lease_finished', message: 'Live TV-sessionen er afsluttet' });
      }
      const allocation = await this.allocate(tx, actor, channelId, entitlements, preferredMethod, current);
      if (current.jobId) await tx.systemJob.updateMany({ where: { id: current.jobId, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled' } });
      const updated = await tx.liveTvLease.update({ where: { id: current.id }, data: {
        channelId, sourceId: allocation.source.sourceId, connectionId: allocation.source.connectionId,
        method: allocation.method, status: allocation.method === 'direct_play' ? 'ready' : 'preparing',
        runtimeState: 'starting', currentBitrate: null, bufferAheadMs: null, lastError: null, jobId: null,
        leaseExpiresAt: new Date(Date.now() + this.leaseSeconds * 1_000), lastHeartbeatAt: new Date(),
      }, include: { channel: true } });
      return this.queueStreamJob(tx, updated, allocation.method, entitlements.allowVideoTranscode);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.response(lease, token);
  }

  async heartbeat(leaseId: string, token: string | undefined, dto: LiveTvHeartbeatDto) {
    const lease = await this.tokenLease(leaseId, token);
    const now = new Date();
    const updated = await this.prisma.liveTvLease.updateMany({
      where: { id: lease.id, status: { in: [...activeStatuses] }, leaseExpiresAt: { gt: now } },
      data: {
        leaseExpiresAt: new Date(now.getTime() + this.leaseSeconds * 1_000), lastHeartbeatAt: now,
        ...(dto.runtimeState ? { runtimeState: dto.runtimeState, ...(dto.runtimeState === 'playing' && lease.status === 'ready' ? { status: 'active' } : {}) } : {}),
        ...(dto.currentBitrate !== undefined ? { currentBitrate: dto.currentBitrate } : {}),
        ...(dto.bufferAheadMs !== undefined ? { bufferAheadMs: dto.bufferAheadMs } : {}),
        ...(dto.stallCount !== undefined ? { stallCount: dto.stallCount } : {}),
      },
    });
    if (updated.count !== 1) throw new ConflictException({ code: 'live_tv_heartbeat_conflict', message: 'Live TV-sessionen er udløbet' });
    return { accepted: true, leaseSeconds: this.leaseSeconds };
  }

  async release(leaseId: string, token: string | undefined, reason = 'user_stopped') {
    const lease = await this.tokenLease(leaseId, token, false);
    if (!activeStatuses.includes(lease.status as typeof activeStatuses[number])) return { released: false, status: lease.status };
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.liveTvLease.update({ where: { id: lease.id }, data: { status: 'released', runtimeState: 'stopped', endedAt: now, leaseExpiresAt: now, lastError: reason } }),
      ...(lease.jobId ? [this.prisma.systemJob.updateMany({ where: { id: lease.jobId, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled' } })] : []),
    ]);
    return { released: true, status: 'released' };
  }

  async status(leaseId: string, token: string | undefined) {
    const lease = await this.tokenLease(leaseId, token, false);
    return { id: lease.id, status: lease.status, method: lease.method, runtimeState: lease.runtimeState,
      currentBitrate: lease.currentBitrate, bufferAheadMs: lease.bufferAheadMs, stallCount: lease.stallCount,
      error: lease.lastError, channel: lease.channel };
  }

  async castHandoff(actor: AuthenticatedUser, leaseId: string, token: string) {
    const rights = await this.entitlements(actor);
    if (!rights.allowChromecast) throw new ForbiddenException({ code: 'live_tv_cast_not_allowed', message: 'Det aktive abonnement tillader ikke Chromecast' });
    const lease = await this.prisma.liveTvLease.findFirst({ where: { id: leaseId, accountId: actor.accountId, userId: actor.sub }, include: { channel: true } });
    this.assertToken(lease, token);
    if (!publicBaseUrl()) throw new BadRequestException({ code: 'live_tv_public_url_required', message: 'BB_MEDIA_PUBLIC_URL skal være konfigureret til Chromecast' });
    await this.prisma.liveTvLease.update({ where: { id: lease!.id }, data: { isCastSession: true } });
    return this.response(lease!, token);
  }

  async endCastHandoff(actor: AuthenticatedUser, leaseId: string, token: string) {
    const lease = await this.prisma.liveTvLease.findFirst({ where: { id: leaseId, accountId: actor.accountId, userId: actor.sub } });
    this.assertToken(lease, token);
    await this.prisma.liveTvLease.update({ where: { id: lease!.id }, data: { isCastSession: false } });
    return { accepted: true };
  }

  async sourceForStream(leaseId: string, token: string | undefined) {
    const lease = await this.tokenLease(leaseId, token);
    const source = await this.prisma.liveTvChannelSource.findUnique({ where: { id: lease.sourceId } });
    if (!source) throw new NotFoundException({ code: 'live_tv_source_missing', message: 'Kanalkilden findes ikke længere' });
    return { lease, source };
  }

  private async allocate(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    channelId: string,
    rights: Awaited<ReturnType<LiveTvPlaybackService['entitlements']>>,
    preferredMethod: string,
    current?: { id: string; connectionId: string; sourceId: string } | null,
  ) {
    const channel = await tx.liveTvChannel.findFirst({
      where: { id: channelId, accountId: actor.accountId, enabled: true, ...(rights.isChildProfile ? { isAdult: false } : {}) },
      include: { sources: { where: { enabled: true }, include: { connection: { include: { provider: true } } } } },
    });
    if (!channel) throw new NotFoundException({ code: 'live_tv_channel_unavailable', message: 'Kanalen er ikke tilgængelig for den aktive profil' });
    const methodBySource = new Map<string, LiveTvMethod>();
    const candidates: LiveTvSourceCandidate[] = [];
    for (const source of channel.sources) {
      if (!source.connection.enabled || !source.connection.provider.enabled) continue;
      const chosenMethod = chooseLiveTvMethod(source.streamFormat, rights, preferredMethod);
      const method = chosenMethod === 'direct_play' && preferredMethod === 'auto' && rights.allowDirectStream
        ? 'direct_stream'
        : chosenMethod;
      if (!method) continue;
      methodBySource.set(source.id, method);
      candidates.push({ sourceId: source.id, connectionId: source.connectionId, providerId: source.connection.providerId,
        streamFormat: source.streamFormat, sourcePriority: source.priority, connectionPriority: source.connection.priority,
        providerPriority: source.connection.provider.priority, connectionLimit: source.connection.maxConcurrentStreams,
        providerUserLimit: source.connection.provider.perUserStreamLimit });
    }
    if (!candidates.length) throw new ForbiddenException({ code: 'live_tv_method_not_allowed', message: 'Abonnementet tillader ikke den afspilningsmetode, som kanalen kræver' });
    const recordingRows = await tx.liveTvRecording.findMany({
      where: { status: 'recording', connectionId: { in: [...new Set(candidates.map((candidate) => candidate.connectionId))] } },
      select: { connectionId: true, userId: true, connection: { select: { providerId: true } } },
    });
    const recordingsByConnection = new Map<string, number>();
    const actorRecordingsByProvider = new Map<string, number>();
    for (const recording of recordingRows) {
      if (recording.connectionId) recordingsByConnection.set(recording.connectionId, (recordingsByConnection.get(recording.connectionId) ?? 0) + 1);
      if (recording.userId === actor.sub && recording.connection) {
        actorRecordingsByProvider.set(recording.connection.providerId, (actorRecordingsByProvider.get(recording.connection.providerId) ?? 0) + 1);
      }
    }
    const capacityAdjustedCandidates = candidates.map((candidate) => ({
      ...candidate,
      connectionLimit: Math.max(0, candidate.connectionLimit - (recordingsByConnection.get(candidate.connectionId) ?? 0)),
      providerUserLimit: Math.max(0, candidate.providerUserLimit - (actorRecordingsByProvider.get(candidate.providerId) ?? 0)),
    }));
    const connectionIds = [...new Set(capacityAdjustedCandidates.map((candidate) => candidate.connectionId))];
    const active = await tx.liveTvLease.groupBy({ by: ['connectionId'], where: {
      connectionId: { in: connectionIds }, status: { in: [...activeStatuses] }, leaseExpiresAt: { gt: new Date() },
      ...(current ? { id: { not: current.id } } : {}),
    }, _count: { _all: true } });
    const providerLeases = await tx.liveTvLease.findMany({ where: {
      userId: actor.sub, status: { in: [...activeStatuses] }, leaseExpiresAt: { gt: new Date() },
      ...(current ? { id: { not: current.id } } : {}),
    }, select: { connection: { select: { providerId: true } } } });
    const activeByProvider = new Map<string, number>();
    for (const lease of providerLeases) activeByProvider.set(lease.connection.providerId, (activeByProvider.get(lease.connection.providerId) ?? 0) + 1);
    const selected = selectLiveTvSource(capacityAdjustedCandidates, new Map(active.map((entry) => [entry.connectionId, entry._count._all])), activeByProvider);
    if (!selected) throw new ConflictException({ code: 'live_tv_pool_busy', message: 'Alle tilladte M3U-forbindelser er optaget. Prøv igen om et øjeblik.' });
    return { source: selected, method: methodBySource.get(selected.sourceId)! };
  }

  private async entitlements(actor: AuthenticatedUser) {
    if (!actor.profileId || !actor.deviceId) throw new ForbiddenException({ code: 'live_tv_context_missing', message: 'Aktiv profil og enhed er påkrævet' });
    const profile = await this.prisma.profile.findFirst({
      where: { id: actor.profileId, accountId: actor.accountId, userId: actor.sub, archivedAt: null },
      include: { user: { include: { subscriptions: { where: { status: { in: ['active', 'trialing', 'grace_period'] }, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, include: { planVersion: true }, orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    const device = await this.prisma.device.findFirst({ where: { id: actor.deviceId, accountId: actor.accountId, userId: actor.sub, isRevoked: false } });
    const version = profile?.user.subscriptions[0]?.planVersion;
    if (!profile || profile.user.status !== 'active' || !device || !version) throw new ForbiddenException({ code: 'live_tv_subscription_required', message: 'En aktiv profil, enhed og abonnement er påkrævet til Live TV' });
    return { profileId: profile.id, deviceId: device.id, isChildProfile: profile.isChildProfile,
      maxConcurrentStreams: version.maxConcurrentStreams, allowDirectPlay: version.allowDirectPlay,
      allowDirectStream: version.allowDirectStream, allowVideoTranscode: version.allowVideoTranscode,
      allowChromecast: version.allowChromecast };
  }

  private async assertPlanCapacity(tx: Prisma.TransactionClient, actor: AuthenticatedUser, limit: number) {
    const now = new Date();
    const [vod, live, recordings] = await Promise.all([
      tx.playbackSession.count({ where: { userId: actor.sub, status: { in: ['reserving', 'active', 'paused'] }, leaseExpiresAt: { gt: now } } }),
      tx.liveTvLease.count({ where: { userId: actor.sub, status: { in: [...activeStatuses] }, leaseExpiresAt: { gt: now } } }),
      tx.liveTvRecording.count({ where: { userId: actor.sub, status: 'recording' } }),
    ]);
    const active = vod + live + recordings;
    if (active >= limit) throw new ForbiddenException({ code: 'max_streams_reached', message: `Abonnementet tillader ${limit} samtidig(e) stream(s); ${active} er aktive` });
  }

  private async queueStreamJob(tx: Prisma.TransactionClient, lease: LiveTvLeaseWithChannel, method: LiveTvMethod, allowFallback: boolean): Promise<LiveTvLeaseWithChannel> {
    if (method === 'direct_play') return lease;
    const job = await tx.systemJob.create({ data: { accountId: lease.accountId, type: 'live-tv.stream', status: 'queued', maxAttempts: 3,
      payload: { leaseId: lease.id, method, allowTranscodeFallback: allowFallback } } });
    return tx.liveTvLease.update({ where: { id: lease.id }, data: { jobId: job.id }, include: { channel: true } });
  }

  private async response(lease: { id: string; method: string; status: string; leaseExpiresAt: Date; channel: { id: string; name: string; number: number | null; logoUrl: string | null } }, token: string) {
    const base = `${publicBaseUrl()}/api/v1/live-tv/stream/${lease.id}`;
    const query = `token=${encodeURIComponent(token)}`;
    return { accepted: true, leaseId: lease.id, method: lease.method, status: lease.status, channel: lease.channel,
      streamToken: token, streamUrl: `${base}/${lease.method === 'direct_play' ? 'direct' : 'manifest'}?${query}`,
      statusUrl: `${base}/status?${query}`, heartbeatUrl: `${base}/heartbeat?${query}`, releaseUrl: `${base}?${query}`,
      contentType: 'application/vnd.apple.mpegurl', leaseExpiresAt: lease.leaseExpiresAt };
  }

  private async tokenLease(id: string, token: string | undefined, requireActive = true) {
    if (!token) throw new UnauthorizedException({ code: 'live_tv_token_required', message: 'Live TV-streamtoken mangler' });
    const lease = await this.prisma.liveTvLease.findUnique({ where: { id }, include: { channel: true } });
    this.assertToken(lease, token);
    if (requireActive && (!activeStatuses.includes(lease!.status as typeof activeStatuses[number]) || lease!.leaseExpiresAt <= new Date())) {
      throw new ConflictException({ code: 'live_tv_lease_expired', message: 'Live TV-sessionen er udløbet' });
    }
    return lease!;
  }

  private assertToken(lease: { streamTokenHash: string } | null, token: string) {
    if (!lease || hashToken(token) !== lease.streamTokenHash) throw new UnauthorizedException({ code: 'live_tv_token_invalid', message: 'Live TV-streamtoken er ugyldig' });
  }

  private lockPool(tx: Prisma.TransactionClient, accountId: string) {
    return tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bbmedia:live-tv-pool'), hashtext(CAST(${accountId} AS text)))::text AS lock_result`;
  }

  private async expireLeases(tx: Prisma.TransactionClient, accountId: string) {
    const expired = await tx.liveTvLease.findMany({ where: { accountId, status: { in: [...activeStatuses] }, leaseExpiresAt: { lte: new Date() } }, select: { id: true, jobId: true } });
    if (!expired.length) return;
    const now = new Date();
    await tx.liveTvLease.updateMany({ where: { id: { in: expired.map((lease) => lease.id) } }, data: { status: 'expired', endedAt: now } });
    await tx.systemJob.updateMany({ where: { id: { in: expired.flatMap((lease) => lease.jobId ? [lease.jobId] : []) }, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled' } });
  }
}

function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
function publicBaseUrl() { return (process.env.BB_MEDIA_PUBLIC_URL?.trim() || '').replace(/\/$/, ''); }
