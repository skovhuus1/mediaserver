import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../system/secret-value';
import type {
  CreateLiveTvConnectionDto, CreateLiveTvProviderDto, UpdateLiveTvChannelDto,
  UpdateLiveTvConnectionDto, UpdateLiveTvProviderDto, UpdateLiveTvSourceDto,
} from './live-tv.dto';

@Injectable()
export class LiveTvService {
  constructor(private readonly prisma: PrismaService) {}

  async providers(actor: AuthenticatedUser) {
    const providers = await this.prisma.liveTvProvider.findMany({
      where: { accountId: actor.accountId },
      include: { connections: { orderBy: [{ priority: 'asc' }, { name: 'asc' }] }, epgSource: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    const active = await this.prisma.liveTvLease.groupBy({
      by: ['connectionId'],
      where: { accountId: actor.accountId, status: { in: ['preparing', 'ready', 'active'] }, leaseExpiresAt: { gt: new Date() } },
      _count: { _all: true },
    });
    const counts = new Map(active.map((entry) => [entry.connectionId, entry._count._all]));
    return providers.map((provider) => ({
      id: provider.id, name: provider.name, enabled: provider.enabled, priority: provider.priority,
      perUserStreamLimit: provider.perUserStreamLimit, createdAt: provider.createdAt, updatedAt: provider.updatedAt,
      epg: provider.epgSource ? {
        configured: true, enabled: provider.epgSource.enabled, url: this.masked(provider.epgSource.encryptedUrl),
        healthStatus: provider.epgSource.healthStatus, lastError: provider.epgSource.lastError,
        lastImportedAt: provider.epgSource.lastImportedAt,
      } : null,
      connections: provider.connections.map((connection) => ({
        id: connection.id, name: connection.name, enabled: connection.enabled, priority: connection.priority,
        maxConcurrentStreams: connection.maxConcurrentStreams, activeStreams: counts.get(connection.id) ?? 0,
        playlistUrl: this.masked(connection.playlistUrl), healthStatus: connection.healthStatus,
        lastError: connection.lastError, lastImportedAt: connection.lastImportedAt,
      })),
    }));
  }

  async createProvider(actor: AuthenticatedUser, dto: CreateLiveTvProviderDto) {
    const provider = await this.prisma.liveTvProvider.create({
      data: {
        accountId: actor.accountId, name: dto.name.trim(), priority: dto.priority,
        perUserStreamLimit: dto.perUserStreamLimit,
        connections: { create: {
          accountId: actor.accountId, name: dto.connectionName.trim(), priority: dto.priority,
          maxConcurrentStreams: dto.maxConcurrentStreams,
          playlistUrl: encryptSecret(dto.playlistUrl) as unknown as Prisma.InputJsonValue,
          playlistFingerprint: fingerprint(dto.playlistUrl),
        } },
        ...(dto.epgUrl ? { epgSource: { create: {
          accountId: actor.accountId,
          encryptedUrl: encryptSecret(dto.epgUrl) as unknown as Prisma.InputJsonValue,
        } } } : {}),
      },
    });
    await this.audit(actor, 'live_tv.provider.create', provider.id, { name: provider.name });
    return { id: provider.id };
  }

  async updateProvider(actor: AuthenticatedUser, providerId: string, dto: UpdateLiveTvProviderDto) {
    await this.provider(actor, providerId);
    const provider = await this.prisma.liveTvProvider.update({ where: { id: providerId }, data: {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.perUserStreamLimit !== undefined ? { perUserStreamLimit: dto.perUserStreamLimit } : {}),
    } });
    if (dto.clearEpg) await this.prisma.liveTvEpgSource.deleteMany({ where: { providerId, accountId: actor.accountId } });
    else if (dto.epgUrl) await this.prisma.liveTvEpgSource.upsert({
      where: { providerId },
      create: { accountId: actor.accountId, providerId, encryptedUrl: encryptSecret(dto.epgUrl) as unknown as Prisma.InputJsonValue },
      update: { encryptedUrl: encryptSecret(dto.epgUrl) as unknown as Prisma.InputJsonValue, enabled: true, healthStatus: 'unknown', lastError: null },
    });
    await this.audit(actor, 'live_tv.provider.update', providerId, { fields: Object.keys(dto).filter((key) => !key.toLowerCase().includes('url')) });
    return { id: provider.id, updated: true };
  }

  async disableProvider(actor: AuthenticatedUser, providerId: string) {
    await this.provider(actor, providerId);
    await this.prisma.$transaction([
      this.prisma.liveTvProvider.update({ where: { id: providerId }, data: { enabled: false } }),
      this.prisma.liveTvConnection.updateMany({ where: { providerId, accountId: actor.accountId }, data: { enabled: false } }),
    ]);
    await this.audit(actor, 'live_tv.provider.disable', providerId);
    return { id: providerId, enabled: false };
  }

  async createConnection(actor: AuthenticatedUser, providerId: string, dto: CreateLiveTvConnectionDto) {
    await this.provider(actor, providerId);
    const connection = await this.prisma.liveTvConnection.create({ data: {
      accountId: actor.accountId, providerId, name: dto.name.trim(), priority: dto.priority,
      maxConcurrentStreams: dto.maxConcurrentStreams,
      playlistUrl: encryptSecret(dto.playlistUrl) as unknown as Prisma.InputJsonValue,
      playlistFingerprint: fingerprint(dto.playlistUrl),
    } });
    await this.audit(actor, 'live_tv.connection.create', connection.id, { providerId, name: connection.name });
    return { id: connection.id };
  }

  async updateConnection(actor: AuthenticatedUser, connectionId: string, dto: UpdateLiveTvConnectionDto) {
    await this.connection(actor, connectionId);
    await this.prisma.liveTvConnection.update({ where: { id: connectionId }, data: {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.maxConcurrentStreams !== undefined ? { maxConcurrentStreams: dto.maxConcurrentStreams } : {}),
      ...(dto.playlistUrl ? {
        playlistUrl: encryptSecret(dto.playlistUrl) as unknown as Prisma.InputJsonValue,
        playlistFingerprint: fingerprint(dto.playlistUrl), healthStatus: 'unknown', lastError: null,
      } : {}),
    } });
    await this.audit(actor, 'live_tv.connection.update', connectionId, { fields: Object.keys(dto).filter((key) => key !== 'playlistUrl') });
    return { id: connectionId, updated: true };
  }

  async disableConnection(actor: AuthenticatedUser, connectionId: string) {
    await this.connection(actor, connectionId);
    const active = await this.prisma.liveTvLease.count({ where: { connectionId, status: { in: ['preparing', 'ready', 'active'] }, leaseExpiresAt: { gt: new Date() } } });
    if (active) throw new ConflictException({ code: 'live_tv_connection_in_use', message: 'Forbindelsen har aktive Live TV-streams' });
    await this.prisma.liveTvConnection.update({ where: { id: connectionId }, data: { enabled: false } });
    await this.audit(actor, 'live_tv.connection.disable', connectionId);
    return { id: connectionId, enabled: false };
  }

  async queueImport(actor: AuthenticatedUser, providerId: string) {
    await this.provider(actor, providerId);
    return this.queueUnique(actor, 'live-tv.import', providerId);
  }

  async queueEpg(actor: AuthenticatedUser, providerId: string) {
    const provider = await this.prisma.liveTvProvider.findFirst({ where: { id: providerId, accountId: actor.accountId }, include: { epgSource: true } });
    if (!provider?.epgSource?.enabled) throw new BadRequestException({ code: 'live_tv_epg_missing', message: 'Provideren har ingen aktiv XMLTV-kilde' });
    return this.queueUnique(actor, 'live-tv.epg', providerId);
  }

  async jobs(actor: AuthenticatedUser) {
    const jobs = await this.prisma.systemJob.findMany({
      where: { accountId: actor.accountId, type: { in: ['live-tv.import', 'live-tv.epg', 'live-tv.stream'] } },
      orderBy: { createdAt: 'desc' }, take: 30,
    });
    return jobs.map((job) => ({ id: job.id, type: job.type, status: job.status, payload: job.payload, attemptCount: job.attemptCount, createdAt: job.createdAt, updatedAt: job.updatedAt }));
  }

  async adminChannels(actor: AuthenticatedUser, search?: string, group?: string) {
    const channels = await this.prisma.liveTvChannel.findMany({
      where: { accountId: actor.accountId, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}), ...(group ? { groupName: group } : {}) },
      include: { sources: { include: { connection: { include: { provider: true } } }, orderBy: { priority: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }, { name: 'asc' }], take: 1_000,
    });
    const duplicateMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const channel of channels) {
      const key = comparableName(channel.name);
      duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), { id: channel.id, name: channel.name }]);
    }
    return channels.map((channel) => ({
      id: channel.id, tvgId: channel.tvgId, name: channel.name, number: channel.number, logoUrl: channel.logoUrl,
      groupName: channel.groupName, enabled: channel.enabled, isAdult: channel.isAdult, metadataLocked: channel.metadataLocked,
      sortOrder: channel.sortOrder,
      sources: channel.sources.map((source) => ({ id: source.id, sourceName: source.sourceName, enabled: source.enabled,
        priority: source.priority, streamFormat: source.streamFormat, connectionId: source.connectionId,
        connectionName: source.connection.name, providerId: source.connection.providerId, providerName: source.connection.provider.name })),
      suspectedDuplicates: (duplicateMap.get(comparableName(channel.name)) ?? []).filter((candidate) => candidate.id !== channel.id),
    }));
  }

  async updateChannel(actor: AuthenticatedUser, channelId: string, dto: UpdateLiveTvChannelDto) {
    await this.channel(actor, channelId);
    await this.prisma.liveTvChannel.update({ where: { id: channelId }, data: {
      ...dto,
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.groupName !== undefined ? { groupName: dto.groupName.trim() || null } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl.trim() || null } : {}),
    } });
    await this.audit(actor, 'live_tv.channel.update', channelId, { fields: Object.keys(dto) });
    return { id: channelId, updated: true };
  }

  async updateSource(actor: AuthenticatedUser, sourceId: string, dto: UpdateLiveTvSourceDto) {
    const source = await this.prisma.liveTvChannelSource.findFirst({ where: { id: sourceId, channel: { accountId: actor.accountId } } });
    if (!source) throw new NotFoundException({ code: 'live_tv_source_missing', message: 'Kanalkilden blev ikke fundet' });
    await this.prisma.liveTvChannelSource.update({ where: { id: sourceId }, data: dto });
    await this.audit(actor, 'live_tv.source.update', sourceId, { fields: Object.keys(dto) });
    return { id: sourceId, updated: true };
  }

  async mergeChannels(actor: AuthenticatedUser, targetChannelId: string, sourceChannelId: string) {
    if (targetChannelId === sourceChannelId) throw new BadRequestException({ code: 'live_tv_merge_same_channel', message: 'En kanal kan ikke flettes med sig selv' });
    await Promise.all([this.channel(actor, targetChannelId), this.channel(actor, sourceChannelId)]);
    const active = await this.prisma.liveTvLease.count({ where: { channelId: sourceChannelId, status: { in: ['preparing', 'ready', 'active'] }, leaseExpiresAt: { gt: new Date() } } });
    if (active) throw new ConflictException({ code: 'live_tv_channel_in_use', message: 'Dubletkanalen har en aktiv stream' });
    await this.prisma.$transaction(async (tx) => {
      const favorites = await tx.liveTvFavorite.findMany({ where: { channelId: sourceChannelId } });
      for (const favorite of favorites) await tx.liveTvFavorite.upsert({
        where: { profileId_channelId: { profileId: favorite.profileId, channelId: targetChannelId } },
        create: { accountId: favorite.accountId, profileId: favorite.profileId, channelId: targetChannelId }, update: {},
      });
      await tx.liveTvFavorite.deleteMany({ where: { channelId: sourceChannelId } });
      await tx.liveTvProgram.deleteMany({ where: { channelId: sourceChannelId } });
      await tx.liveTvChannelSource.updateMany({ where: { channelId: sourceChannelId }, data: { channelId: targetChannelId } });
      await tx.liveTvChannel.delete({ where: { id: sourceChannelId } });
    });
    await this.audit(actor, 'live_tv.channel.merge', targetChannelId, { sourceChannelId });
    return { targetChannelId, sourceChannelId, merged: true };
  }

  async guide(actor: AuthenticatedUser, fromInput?: string, toInput?: string) {
    const profileId = this.profileId(actor);
    const profile = await this.prisma.profile.findFirst({ where: { id: profileId, accountId: actor.accountId, userId: actor.sub, archivedAt: null } });
    if (!profile) throw new ForbiddenException({ code: 'active_profile_required', message: 'En aktiv profil er påkrævet' });
    const from = validDate(fromInput) ?? new Date(Date.now() - 30 * 60_000);
    const requestedTo = validDate(toInput) ?? new Date(from.getTime() + 12 * 60 * 60_000);
    const to = new Date(Math.min(requestedTo.getTime(), from.getTime() + 48 * 60 * 60_000));
    const channels = await this.prisma.liveTvChannel.findMany({
      where: { accountId: actor.accountId, enabled: true, ...(profile.isChildProfile ? { isAdult: false } : {}), sources: { some: { enabled: true, connection: { enabled: true, provider: { enabled: true } } } } },
      include: {
        programs: { where: { startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: 'asc' } },
        favorites: { where: { profileId } },
      },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }, { name: 'asc' }],
    });
    return { from, to, channels: channels.map((channel) => ({
      id: channel.id, name: channel.name, number: channel.number, logoUrl: channel.logoUrl, groupName: channel.groupName,
      favorite: channel.favorites.length > 0,
      programs: channel.programs.map((program) => ({ id: program.id, startsAt: program.startsAt, endsAt: program.endsAt,
        title: program.title, subtitle: program.subtitle, description: program.description, category: program.category,
        iconUrl: program.iconUrl, episode: program.episode })),
    })) };
  }

  async setFavorite(actor: AuthenticatedUser, channelId: string, favorite: boolean) {
    const profileId = this.profileId(actor);
    await this.channel(actor, channelId);
    if (favorite) await this.prisma.liveTvFavorite.upsert({
      where: { profileId_channelId: { profileId, channelId } },
      create: { accountId: actor.accountId, profileId, channelId }, update: {},
    });
    else await this.prisma.liveTvFavorite.deleteMany({ where: { accountId: actor.accountId, profileId, channelId } });
    return { channelId, favorite };
  }

  private async queueUnique(actor: AuthenticatedUser, type: string, providerId: string) {
    const pending = await this.prisma.systemJob.findMany({ where: { accountId: actor.accountId, type, status: { in: ['queued', 'running'] } }, take: 100 });
    const existing = pending.find((job) => (job.payload as Record<string, unknown>)?.providerId === providerId);
    if (existing) return existing;
    const job = await this.prisma.systemJob.create({ data: { accountId: actor.accountId, type, status: 'queued', payload: { providerId } } });
    await this.audit(actor, `${type}.queue`, job.id, { providerId });
    return job;
  }

  private provider(actor: AuthenticatedUser, id: string) {
    return this.prisma.liveTvProvider.findFirst({ where: { id, accountId: actor.accountId } }).then((value) => {
      if (!value) throw new NotFoundException({ code: 'live_tv_provider_missing', message: 'Live TV-provideren blev ikke fundet' });
      return value;
    });
  }

  private connection(actor: AuthenticatedUser, id: string) {
    return this.prisma.liveTvConnection.findFirst({ where: { id, accountId: actor.accountId } }).then((value) => {
      if (!value) throw new NotFoundException({ code: 'live_tv_connection_missing', message: 'M3U-forbindelsen blev ikke fundet' });
      return value;
    });
  }

  private channel(actor: AuthenticatedUser, id: string) {
    return this.prisma.liveTvChannel.findFirst({ where: { id, accountId: actor.accountId } }).then((value) => {
      if (!value) throw new NotFoundException({ code: 'live_tv_channel_missing', message: 'Live TV-kanalen blev ikke fundet' });
      return value;
    });
  }

  private profileId(actor: AuthenticatedUser) {
    if (!actor.profileId) throw new ForbiddenException({ code: 'active_profile_required', message: 'En aktiv profil er påkrævet' });
    return actor.profileId;
  }

  private masked(value: Prisma.JsonValue) {
    try { const url = new URL(decryptSecret(value)); return `${url.protocol}//${url.host}/••••`; } catch { return 'Krypteret kilde'; }
  }

  private audit(actor: AuthenticatedUser, action: string, code: string, details?: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: actor.profileId,
      action, outcome: 'success', code, ...(details ? { details: details as Prisma.InputJsonValue } : {}) } });
  }
}

function fingerprint(value: string) { return createHash('sha256').update(value.trim()).digest('hex'); }
function comparableName(value: string) { return value.toLocaleLowerCase('da').normalize('NFKD').replace(/\p{M}/gu, '').replace(/\b(uhd|fhd|hd|sd)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function validDate(value?: string) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
