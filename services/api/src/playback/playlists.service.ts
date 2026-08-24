import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { correlationId } from '../common/request-context';
import { homeExperienceCacheKey } from '../experience/home-cache';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeHomeLayout } from '../preferences/home-layout';
import { canonicalMediaTarget } from './media-target';
import type { AddPlaylistItemDto, CreatePlaylistDto, ReorderPlaylistItemsDto, UpdatePlaylistDto } from './playlists.dto';

const playlistMediaSelect = Prisma.validator<Prisma.MediaItemSelect>()({
  id: true,
  title: true,
  type: true,
  seriesTitle: true,
  seriesDisplayTitle: true,
  seriesMetadataProviderId: true,
  seasonNumber: true,
  episodeNumber: true,
  releaseYear: true,
  overview: true,
  rating: true,
  posterPath: true,
  backdropPath: true,
  width: true,
  height: true,
  file: { select: { status: true, durationMs: true, width: true, height: true } },
});

const playlistInclude = Prisma.validator<Prisma.PlaylistInclude>()({
  items: { include: { media: { select: playlistMediaSelect } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
});

type PlaylistRecord = Prisma.PlaylistGetPayload<{ include: typeof playlistInclude }>;

@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(actor: AuthenticatedUser, rawCursor?: string, rawLimit?: string) {
    const profileId = await this.requireProfile(actor);
    const limit = clampLimit(rawLimit);
    const cursor = decodeCursor(rawCursor);
    const where: Prisma.PlaylistWhereInput = {
      accountId: actor.accountId,
      profileId,
      ...(cursor ? { OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }] } : {}),
    };
    const [records, preferences] = await Promise.all([
      this.prisma.playlist.findMany({ where, include: playlistInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1 }),
      this.prisma.profilePreferences.findUnique({ where: { profileId }, select: { homeRowOrder: true } }),
    ]);
    const hasMore = records.length > limit;
    const page = records.slice(0, limit);
    const pinned = new Set(normalizeHomeLayout(preferences?.homeRowOrder, []).order.filter((row) => row.startsWith('playlist:')));
    return {
      items: page.map((playlist) => this.publicPlaylist(playlist, pinned.has(`playlist:${playlist.id}`))),
      nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  async get(actor: AuthenticatedUser, playlistId: string) {
    const profileId = await this.requireProfile(actor);
    const [playlist, preferences] = await Promise.all([
      this.findPlaylist(actor.accountId, profileId, playlistId),
      this.prisma.profilePreferences.findUnique({ where: { profileId }, select: { homeRowOrder: true } }),
    ]);
    const pinned = normalizeHomeLayout(preferences?.homeRowOrder, []).order.includes(`playlist:${playlist.id}`);
    return this.publicPlaylist(playlist, pinned);
  }

  async create(actor: AuthenticatedUser, input: CreatePlaylistDto) {
    const profileId = await this.requireProfile(actor);
    const count = await this.prisma.playlist.count({ where: { accountId: actor.accountId, profileId } });
    if (count >= 50) throw limitError('playlist_limit', 'En profil kan højst have 50 playlister');
    const playlist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.playlist.create({
        data: {
          accountId: actor.accountId,
          profileId,
          name: input.name.trim(),
          description: cleanDescription(input.description),
        },
        include: playlistInclude,
      });
      if (input.pinned) await this.setPinnedRow(tx, actor.accountId, profileId, created.id, true);
      await this.audit(tx, actor, profileId, 'playlist.create', created.id, { pinned: Boolean(input.pinned) });
      return created;
    });
    await this.invalidate(actor.accountId, profileId);
    return this.publicPlaylist(playlist, Boolean(input.pinned));
  }

  async update(actor: AuthenticatedUser, playlistId: string, input: UpdatePlaylistDto) {
    const profileId = await this.requireProfile(actor);
    const playlist = await this.prisma.$transaction(async (tx) => {
      const current = await tx.playlist.findFirst({ where: { id: playlistId, accountId: actor.accountId, profileId }, include: playlistInclude });
      if (!current) throw playlistNotFound();
      assertVersion(current.updatedAt, input.expectedUpdatedAt);
      const updated = await tx.playlist.update({
        where: { id: playlistId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: cleanDescription(input.description) } : {}),
          updatedAt: new Date(),
        },
        include: playlistInclude,
      });
      if (input.pinned !== undefined) await this.setPinnedRow(tx, actor.accountId, profileId, playlistId, input.pinned);
      await this.audit(tx, actor, profileId, 'playlist.update', playlistId, { pinned: input.pinned });
      return updated;
    });
    await this.invalidate(actor.accountId, profileId);
    return this.publicPlaylist(playlist, input.pinned ?? await this.isPinned(profileId, playlistId));
  }

  async remove(actor: AuthenticatedUser, playlistId: string) {
    const profileId = await this.requireProfile(actor);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.playlist.findFirst({ where: { id: playlistId, accountId: actor.accountId, profileId }, select: { id: true } });
      if (!current) throw playlistNotFound();
      await this.setPinnedRow(tx, actor.accountId, profileId, playlistId, false);
      await tx.playlist.delete({ where: { id: playlistId } });
      await this.audit(tx, actor, profileId, 'playlist.delete', playlistId, {});
    });
    await this.invalidate(actor.accountId, profileId);
    return { id: playlistId, deleted: true };
  }

  async addItem(actor: AuthenticatedUser, playlistId: string, mediaId: string, input: AddPlaylistItemDto) {
    const profileId = await this.requireProfile(actor);
    const result = await this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.findFirst({ where: { id: playlistId, accountId: actor.accountId, profileId }, select: { id: true } });
      if (!playlist) throw playlistNotFound();
      const media = await tx.mediaItem.findFirst({ where: { id: mediaId, accountId: actor.accountId }, select: playlistMediaSelect });
      if (!media || media.file?.status !== 'ready') throw new NotFoundException({ code: 'playlist_media_not_found', message: 'Titlen findes ikke som et afspilleligt lokalt medie' });
      const target = canonicalMediaTarget(media, input.targetType ?? 'auto');
      const existing = await tx.playlistItem.findUnique({ where: { playlistId_targetKey: { playlistId, targetKey: target.targetKey } } });
      if (existing) return { playlist, item: existing, created: false };
      const count = await tx.playlistItem.count({ where: { playlistId } });
      if (count >= 500) throw limitError('playlist_item_limit', 'En playliste kan højst indeholde 500 titler');
      const last = await tx.playlistItem.aggregate({ where: { playlistId }, _max: { position: true } });
      const item = await tx.playlistItem.create({
        data: { playlistId, mediaId, targetType: target.targetType, targetKey: target.targetKey, position: (last._max.position ?? -1) + 1 },
      });
      await tx.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() } });
      await this.audit(tx, actor, profileId, 'playlist.item_add', playlistId, { itemId: item.id, targetKey: target.targetKey });
      return { playlist, item, created: true };
    });
    await this.invalidate(actor.accountId, profileId);
    return { playlistId, itemId: result.item.id, created: result.created };
  }

  async removeItem(actor: AuthenticatedUser, playlistId: string, itemId: string) {
    const profileId = await this.requireProfile(actor);
    const removed = await this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.findFirst({ where: { id: playlistId, accountId: actor.accountId, profileId }, select: { id: true } });
      if (!playlist) throw playlistNotFound();
      const result = await tx.playlistItem.deleteMany({ where: { id: itemId, playlistId } });
      if (result.count) {
        await tx.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() } });
        await this.audit(tx, actor, profileId, 'playlist.item_remove', playlistId, { itemId });
      }
      return result.count > 0;
    });
    await this.invalidate(actor.accountId, profileId);
    return { playlistId, itemId, removed };
  }

  async reorder(actor: AuthenticatedUser, playlistId: string, input: ReorderPlaylistItemsDto) {
    const profileId = await this.requireProfile(actor);
    const updatedAt = await this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.findFirst({ where: { id: playlistId, accountId: actor.accountId, profileId }, select: { id: true, updatedAt: true } });
      if (!playlist) throw playlistNotFound();
      assertVersion(playlist.updatedAt, input.expectedUpdatedAt);
      const items = await tx.playlistItem.findMany({ where: { playlistId }, select: { id: true } });
      const actual = new Set(items.map((item) => item.id));
      if (actual.size !== input.itemIds.length || input.itemIds.some((id) => !actual.has(id)) || new Set(input.itemIds).size !== input.itemIds.length) {
        throw new BadRequestException({ code: 'playlist_order_invalid', message: 'Rækkefølgen skal indeholde hver playlistepost præcis én gang' });
      }
      await Promise.all(input.itemIds.map((id, position) => tx.playlistItem.update({ where: { id }, data: { position } })));
      const updated = await tx.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() }, select: { updatedAt: true } });
      await this.audit(tx, actor, profileId, 'playlist.reorder', playlistId, { itemCount: input.itemIds.length });
      return updated.updatedAt;
    });
    await this.invalidate(actor.accountId, profileId);
    return { id: playlistId, updatedAt: updatedAt.toISOString() };
  }

  private async findPlaylist(accountId: string, profileId: string, id: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id, accountId, profileId }, include: playlistInclude });
    if (!playlist) throw playlistNotFound();
    return playlist;
  }

  private publicPlaylist(playlist: PlaylistRecord, pinned: boolean) {
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      pinned,
      itemCount: playlist.items.length,
      createdAt: playlist.createdAt.toISOString(),
      updatedAt: playlist.updatedAt.toISOString(),
      items: playlist.items.map((entry) => ({
        id: entry.id,
        position: entry.position,
        targetType: entry.targetType,
        targetKey: entry.targetKey,
        media: publicMedia(entry.media, entry.targetType),
      })),
    };
  }

  private async requireProfile(actor: AuthenticatedUser) {
    if (!actor.profileId) throw new BadRequestException({ code: 'active_profile_required', message: 'Vælg en aktiv profil først' });
    const profile = await this.prisma.profile.findFirst({ where: { id: actor.profileId, accountId: actor.accountId, userId: actor.sub, archivedAt: null }, select: { id: true } });
    if (!profile) throw new NotFoundException({ code: 'profile_not_found', message: 'Den aktive profil findes ikke' });
    return profile.id;
  }

  private async setPinnedRow(tx: Prisma.TransactionClient, accountId: string, profileId: string, playlistId: string, pinned: boolean) {
    const rowId = `playlist:${playlistId}`;
    const preferences = await tx.profilePreferences.findUnique({ where: { profileId } });
    const layout = normalizeHomeLayout(preferences?.homeRowOrder, preferences?.hiddenHomeRows);
    const order = pinned
      ? layout.order.includes(rowId) ? layout.order : [...layout.order, rowId]
      : layout.order.filter((row) => row !== rowId);
    const hidden = layout.hidden.filter((row) => row !== rowId);
    await tx.profilePreferences.upsert({
      where: { profileId },
      create: {
        profileId,
        accountId,
        preferredAudioLanguages: ['da', 'en'],
        preferredSubtitleLanguages: ['da', 'en'],
        subtitleMode: 'auto',
        autoplayNext: true,
        recommendationsEnabled: true,
        homeRowOrder: order,
        hiddenHomeRows: hidden,
      },
      update: { homeRowOrder: order, hiddenHomeRows: hidden },
    });
  }

  private async isPinned(profileId: string, playlistId: string) {
    const preferences = await this.prisma.profilePreferences.findUnique({ where: { profileId }, select: { homeRowOrder: true } });
    return normalizeHomeLayout(preferences?.homeRowOrder, []).order.includes(`playlist:${playlistId}`);
  }

  private audit(tx: Prisma.TransactionClient, actor: AuthenticatedUser, profileId: string, action: string, resourceId: string, details: Record<string, unknown>) {
    return tx.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId,
        correlationId: correlationId(),
        action,
        outcome: 'allowed',
        code: action.replaceAll('.', '_'),
        details: JSON.parse(JSON.stringify({ resourceId, ...details })) as Prisma.InputJsonValue,
      },
    });
  }

  private async invalidate(accountId: string, profileId: string) {
    await this.redis.delete(homeExperienceCacheKey(accountId, profileId)).catch(() => undefined);
  }
}

function publicMedia(media: Prisma.MediaItemGetPayload<{ select: typeof playlistMediaSelect }>, targetType: string) {
  const target = canonicalMediaTarget(media, targetType as 'media' | 'movie' | 'series' | 'episode');
  return {
    id: media.id,
    title: target.displayTitle,
    type: target.targetType === 'series' ? 'series' : media.type,
    targetType: target.targetType,
    targetKey: target.targetKey,
    seriesTitle: media.seriesDisplayTitle ?? media.seriesTitle,
    seasonNumber: media.seasonNumber,
    episodeNumber: media.episodeNumber,
    releaseYear: media.releaseYear,
    overview: media.overview,
    rating: media.rating,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    width: media.file?.width ?? media.width,
    height: media.file?.height ?? media.height,
    durationMs: media.file?.durationMs ?? null,
  };
}

function cleanDescription(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function assertVersion(actual: Date, expected?: string) {
  if (expected && actual.toISOString() !== new Date(expected).toISOString()) {
    throw new ConflictException({ code: 'playlist_update_conflict', message: 'Playlisten er ændret på en anden enhed. Hent den igen før du gemmer.' });
  }
}

function playlistNotFound() {
  return new NotFoundException({ code: 'playlist_not_found', message: 'Playlisten findes ikke for den aktive profil' });
}

function limitError(code: string, message: string) {
  return new BadRequestException({ code, message });
}

function clampLimit(value?: string) {
  const parsed = Number.parseInt(value ?? '24', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 24;
}

function encodeCursor(playlist: { updatedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ updatedAt: playlist.updatedAt.toISOString(), id: playlist.id }), 'utf8').toString('base64url');
}

function decodeCursor(value?: string): { updatedAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { updatedAt?: string; id?: string };
    const updatedAt = new Date(parsed.updatedAt ?? '');
    return parsed.id && Number.isFinite(updatedAt.getTime()) ? { updatedAt, id: parsed.id } : null;
  } catch {
    throw new BadRequestException({ code: 'playlist_cursor_invalid', message: 'Playlist-cursoren er ugyldig' });
  }
}
