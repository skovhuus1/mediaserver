import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { HOME_ROW_IDS, normalizeHomeLayout } from '../preferences/home-layout';
import { canonicalMediaTarget } from '../playback/media-target';
import { homeExperienceCacheKey } from './home-cache';
import { cleanLocalTitle, readLocalGenres, slugifyDiscovery } from './experience-utils';

const homeMediaSelect = Prisma.validator<Prisma.MediaItemSelect>()({
  id: true,
  title: true,
  type: true,
  category: true,
  seriesTitle: true,
  seriesDisplayTitle: true,
  seriesOverview: true,
  seriesMetadataProviderId: true,
  seasonNumber: true,
  episodeNumber: true,
  releaseYear: true,
  releaseDate: true,
  overview: true,
  rating: true,
  posterPath: true,
  seasonPosterPath: true,
  backdropPath: true,
  episodeStillPath: true,
  genres: true,
  width: true,
  height: true,
  bitrate: true,
  codec: true,
  container: true,
  file: { select: { status: true, durationMs: true, width: true, height: true, bitrate: true, container: true, videoCodec: true, audioCodec: true } },
});

type HomeMedia = Prisma.MediaItemGetPayload<{ select: typeof homeMediaSelect }>;
type PublicCard = ReturnType<typeof publicCard>;
type HomeCard = Omit<PublicCard, 'playback'> & { playback: PublicCard['playback'] | null };

const rowLabels: Record<string, string> = {
  recommendations: 'Anbefalet til dig',
  continue: 'Fortsæt med at se',
  watchlist: 'Min liste',
  latest_episodes: 'Seneste episoder',
  recently_added: 'Senest tilføjet',
  new_movies: 'Nye film',
  new_series: 'Nye serier',
  genres: 'Genrer',
  popular: 'Populært på din server',
};

@Injectable()
export class HomeExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async home(actor: AuthenticatedUser) {
    const profileId = this.profileId(actor);
    const cacheKey = homeExperienceCacheKey(actor.accountId, profileId);
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached) as unknown; } catch { /* rebuild corrupt cache entry */ }
    }
    const [preferences, playlists] = await Promise.all([
      this.prisma.profilePreferences.findUnique({ where: { profileId }, select: { homeRowOrder: true, hiddenHomeRows: true } }),
      this.prisma.playlist.findMany({ where: { accountId: actor.accountId, profileId }, select: { id: true, name: true } }),
    ]);
    const playlistNames = new Map(playlists.map((playlist) => [`playlist:${playlist.id}`, playlist.name]));
    const layout = normalizeHomeLayout(preferences?.homeRowOrder, preferences?.hiddenHomeRows);
    const available = layout.order.filter((id) => !id.startsWith('playlist:') || playlistNames.has(id));
    const visible = available.filter((id) => !layout.hidden.includes(id));
    const rows = await Promise.all(visible.map((id) => this.rowPage(actor, profileId, id, 0, 18, playlistNames.get(id))));
    const hero = rows.flatMap((row) => row.items).find((item) => item.type !== 'genre') ?? null;
    const result = {
      hero,
      layout: { order: available, hidden: layout.hidden.filter((id) => available.includes(id)), visible },
      rows,
      generatedAt: new Date().toISOString(),
    };
    await this.redis.setEx(cacheKey, 60, JSON.stringify(result)).catch(() => undefined);
    return result;
  }

  async row(actor: AuthenticatedUser, rowId: string, rawCursor?: string) {
    const profileId = this.profileId(actor);
    if (!HOME_ROW_IDS.includes(rowId as typeof HOME_ROW_IDS[number]) && !rowId.startsWith('playlist:')) {
      throw new NotFoundException({ code: 'home_row_not_found', message: 'Forsiderækken findes ikke' });
    }
    const offset = decodeOffset(rawCursor);
    let playlistName: string | undefined;
    if (rowId.startsWith('playlist:')) {
      const playlist = await this.prisma.playlist.findFirst({ where: { id: rowId.slice(9), accountId: actor.accountId, profileId }, select: { name: true } });
      if (!playlist) throw new NotFoundException({ code: 'home_row_not_found', message: 'Playlisten findes ikke for den aktive profil' });
      playlistName = playlist.name;
    }
    return this.rowPage(actor, profileId, rowId, offset, 24, playlistName);
  }

  private async rowPage(actor: AuthenticatedUser, profileId: string, rowId: string, offset: number, limit: number, playlistName?: string) {
    const all = await this.rowItems(actor, profileId, rowId, offset, limit);
    const items = all.slice(0, limit);
    return {
      id: rowId,
      title: playlistName ?? rowLabels[rowId] ?? 'Playliste',
      items,
      nextCursor: all.length > limit ? encodeOffset(offset + limit) : null,
    };
  }

  private async rowItems(actor: AuthenticatedUser, profileId: string, rowId: string, offset: number, limit: number): Promise<HomeCard[]> {
    if (rowId === 'new_movies') {
      const media = await this.prisma.mediaItem.findMany({
        where: { accountId: actor.accountId, type: 'movie' },
        select: homeMediaSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: limit + 1,
      });
      return media.filter(playable).map((item) => publicCard(item));
    }
    if (rowId === 'latest_episodes') {
      const media = await this.prisma.mediaItem.findMany({
        where: { accountId: actor.accountId, type: 'episode' },
        select: homeMediaSelect,
        orderBy: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'desc' }],
        take: Math.max(200, (offset + limit + 1) * 10),
      });
      return collapseEpisodeSeriesCards(media.filter(playable)).slice(offset, offset + limit + 1);
    }
    if (rowId === 'recently_added') {
      const media = await this.prisma.mediaItem.findMany({
        where: { accountId: actor.accountId, type: 'episode' },
        select: homeMediaSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.max(200, (offset + limit + 1) * 10),
      });
      return collapseEpisodeSeriesCards(media.filter(playable)).slice(offset, offset + limit + 1);
    }
    if (rowId === 'continue') {
      const history = await this.prisma.playbackHistory.findMany({
        where: { accountId: actor.accountId, profileId, completed: false, positionMs: { gt: 0 } },
        include: { media: { select: homeMediaSelect } },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit + 1,
      });
      return history.filter((entry) => playable(entry.media)).map((entry) => publicCard(entry.media, entry.media.type === 'episode' ? 'episode' : undefined, {
        positionMs: entry.positionMs,
        durationMs: entry.media.file?.durationMs ?? null,
        watched: entry.completed,
      }));
    }
    if (rowId === 'watchlist') {
      const entries = await this.prisma.watchlistEntry.findMany({
        where: { accountId: actor.accountId, profileId },
        include: { media: { select: homeMediaSelect } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit + 1,
      });
      return entries.filter((entry) => playable(entry.media)).map((entry) => publicCard(entry.media, entry.targetType as 'media' | 'movie' | 'series' | 'episode', { inWatchlist: true }));
    }
    if (rowId.startsWith('playlist:')) {
      const playlist = await this.prisma.playlist.findFirst({
        where: { id: rowId.slice(9), accountId: actor.accountId, profileId },
        select: { items: { select: { targetType: true, media: { select: homeMediaSelect } }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], skip: offset, take: limit + 1 } },
      });
      if (!playlist) return [];
      return playlist.items.filter((entry) => playable(entry.media)).map((entry) => publicCard(entry.media, entry.targetType as 'media' | 'movie' | 'series' | 'episode'));
    }

    const catalog = await this.prisma.mediaItem.findMany({
      where: { accountId: actor.accountId, type: { in: ['movie', 'episode'] } },
      select: homeMediaSelect,
      orderBy: rowId === 'popular' || rowId === 'recommendations'
        ? [{ rating: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }],
      take: 400,
    });
    const playableCatalog = catalog.filter(playable);
    if (rowId === 'genres') return genreCards(playableCatalog).slice(offset, offset + limit + 1);
    if (rowId === 'new_series') return collapseSeries(playableCatalog.filter((item) => item.type === 'episode')).slice(offset, offset + limit + 1);
    if (rowId === 'popular') {
      const history = await this.prisma.playbackHistory.findMany({ where: { accountId: actor.accountId }, select: { mediaId: true }, orderBy: { updatedAt: 'desc' }, take: 600 });
      const score = new Map<string, number>();
      history.forEach((entry) => score.set(entry.mediaId, (score.get(entry.mediaId) ?? 0) + 1));
      return dedupeCards(playableCatalog.map((item) => publicCard(item)).sort((left, right) => (score.get(right.mediaId) ?? 0) - (score.get(left.mediaId) ?? 0) || (right.rating ?? 0) - (left.rating ?? 0))).slice(offset, offset + limit + 1);
    }
    if (rowId === 'recommendations') {
      const [history, feedback] = await Promise.all([
        this.prisma.playbackHistory.findMany({ where: { accountId: actor.accountId, profileId }, select: { mediaId: true, completed: true } }),
        this.prisma.recommendationFeedback.findMany({ where: { accountId: actor.accountId, profileId }, select: { mediaId: true, type: true } }),
      ]);
      const watched = new Set(history.filter((entry) => entry.completed).map((entry) => entry.mediaId));
      const feedbackMap = new Map(feedback.map((entry) => [entry.mediaId, entry.type]));
      return dedupeCards(playableCatalog
        .filter((item) => !watched.has(item.id) && feedbackMap.get(item.id) !== 'hidden')
        .map((item) => ({ item: publicCard(item), score: (item.rating ?? 0) + (feedbackMap.get(item.id) === 'like' ? 80 : feedbackMap.get(item.id) === 'dislike' ? -80 : 0) }))
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item)).slice(offset, offset + limit + 1);
    }
    return [];
  }

  private profileId(actor: AuthenticatedUser) {
    if (!actor.profileId) throw new BadRequestException({ code: 'active_profile_required', message: 'Vælg en aktiv profil først' });
    return actor.profileId;
  }
}

function playable(media: HomeMedia) {
  return media.file?.status === 'ready';
}

function publicCard(media: HomeMedia, requested?: 'media' | 'movie' | 'series' | 'episode', state: { positionMs?: number; durationMs?: number | null; watched?: boolean; inWatchlist?: boolean; badgeCount?: number } = {}) {
  const target = canonicalMediaTarget(media, requested ?? 'auto');
  const durationMs = state.durationMs ?? media.file?.durationMs ?? null;
  const positionMs = state.positionMs ?? 0;
  const posterPath = target.targetType === 'series'
    ? media.posterPath ?? media.seasonPosterPath
    : media.posterPath ?? media.seasonPosterPath ?? media.episodeStillPath;
  const backdropPath = media.backdropPath ?? media.episodeStillPath;
  return {
    mediaId: media.id,
    targetType: target.targetType,
    targetKey: target.targetKey,
    title: target.targetType === 'series' ? target.displayTitle : cleanLocalTitle(media.title),
    type: target.targetType === 'series' ? 'series' : String(media.type),
    seriesTitle: media.seriesDisplayTitle ?? media.seriesTitle,
    seasonNumber: media.seasonNumber,
    episodeNumber: media.episodeNumber,
    releaseYear: media.releaseYear,
    overview: target.targetType === 'series' ? media.seriesOverview ?? media.overview : media.overview,
    rating: media.rating,
    posterPath,
    backdropPath,
    width: media.file?.width ?? media.width,
    height: media.file?.height ?? media.height,
    positionMs,
    durationMs,
    progressPercent: durationMs && positionMs ? Math.min(100, Math.round(positionMs / durationMs * 100)) : 0,
    badgeCount: state.badgeCount,
    viewerState: { inWatchlist: Boolean(state.inWatchlist), watched: Boolean(state.watched), playlistIds: [] as string[] },
    href: `/watch/title/${encodeURIComponent(media.id)}`,
    playback: {
      id: media.id,
      title: cleanLocalTitle(media.title),
      type: media.type,
      seriesTitle: media.seriesTitle,
      seriesDisplayTitle: media.seriesDisplayTitle,
      seriesMetadataProviderId: media.seriesMetadataProviderId,
      seasonNumber: media.seasonNumber,
      episodeNumber: media.episodeNumber,
      releaseYear: media.releaseYear,
      category: media.category,
      overview: media.overview,
      posterPath,
      backdropPath,
      width: media.file?.width ?? media.width,
      height: media.file?.height ?? media.height,
      file: { durationMs },
    },
  };
}

function collapseEpisodeSeriesCards(media: HomeMedia[]): HomeCard[] {
  const groups = new Map<string, { card: HomeCard; count: number }>();
  media.forEach((item) => {
    const card = publicCard(item, 'series');
    const existing = groups.get(card.targetKey);
    if (existing) {
      existing.count += 1;
      return;
    }
    groups.set(card.targetKey, { card, count: 1 });
  });
  return [...groups.values()].map(({ card, count }) => ({
    ...card,
    badgeCount: count,
  }));
}

function collapseSeries(media: HomeMedia[]): HomeCard[] {
  const seen = new Set<string>();
  return media.flatMap((item) => {
    const card = publicCard(item, 'series');
    if (seen.has(card.targetKey)) return [];
    seen.add(card.targetKey);
    return [card];
  });
}

function dedupeCards(items: HomeCard[]): HomeCard[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.targetKey)) return false;
    seen.add(item.targetKey);
    return true;
  });
}

function genreCards(media: HomeMedia[]): HomeCard[] {
  const genres = new Map<string, { name: string; media: HomeMedia }>();
  media.forEach((item) => readLocalGenres(item.genres).forEach((name) => {
    const key = slugifyDiscovery(name);
    if (!genres.has(key)) genres.set(key, { name, media: item });
  }));
  return [...genres.entries()].sort((left, right) => left[1].name.localeCompare(right[1].name, 'da')).map(([key, entry]) => ({
    ...publicCard(entry.media),
    mediaId: `genre:${key}`,
    targetType: 'media',
    targetKey: `genre:${key}`,
    type: 'genre',
    title: entry.name,
    href: `/watch?genre=${encodeURIComponent(entry.name)}`,
    playback: null,
  }));
}

function encodeOffset(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeOffset(value?: string) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { offset?: number };
    if (!Number.isSafeInteger(parsed.offset) || (parsed.offset ?? -1) < 0) throw new Error('invalid');
    return parsed.offset!;
  } catch {
    throw new BadRequestException({ code: 'home_cursor_invalid', message: 'Rækkecursoren er ugyldig' });
  }
}
