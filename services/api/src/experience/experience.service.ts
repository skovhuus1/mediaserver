import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildSeriesSeasons,
  cleanLocalTitle,
  readLocalCredits,
  readLocalGenres,
  readSimilarProviderIds,
  slugifyDiscovery,
} from './experience-utils';

const mediaSelect = Prisma.validator<Prisma.MediaItemSelect>()({
  id: true,
  title: true,
  type: true,
  category: true,
  seriesTitle: true,
  seriesDisplayTitle: true,
  seriesOverview: true,
  seriesMetadataProviderId: true,
  seasonNumber: true,
  seasonPosterPath: true,
  episodeNumber: true,
  episodeStillPath: true,
  releaseYear: true,
  overview: true,
  rating: true,
  metadataProvider: true,
  metadataProviderId: true,
  posterPath: true,
  backdropPath: true,
  genres: true,
  credits: true,
  similarProviderIds: true,
  file: { select: { status: true, durationMs: true, width: true, height: true } },
  timelineMarkers: {
    select: { kind: true, startMs: true, endMs: true, source: true },
    orderBy: { startMs: 'asc' },
  },
});

type MediaRecord = Prisma.MediaItemGetPayload<{ select: typeof mediaSelect }>;

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  async title(actor: AuthenticatedUser, mediaId: string) {
    const anchor = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: mediaSelect,
    });
    if (!anchor) throw notFound('Titlen findes ikke i dit lokale bibliotek.');

    const seriesName = anchor.seriesDisplayTitle ?? anchor.seriesTitle ?? (anchor.type === 'series' ? anchor.title : null);
    const isSeries = Boolean(seriesName) && (anchor.type === 'episode' || anchor.type === 'series' || anchor.category === 'series');
    const base = this.titleSummary(anchor, seriesName);
    if (!isSeries || !seriesName) {
      return { mode: 'title', title: base, discovery: this.discovery(anchor, null) };
    }

    const candidates: Prisma.MediaItemWhereInput[] = [];
    if (anchor.seriesMetadataProviderId) candidates.push({ seriesMetadataProviderId: anchor.seriesMetadataProviderId });
    if (anchor.seriesTitle) candidates.push({ seriesTitle: { equals: anchor.seriesTitle, mode: 'insensitive' } });
    candidates.push({ seriesDisplayTitle: { equals: seriesName, mode: 'insensitive' } });
    const episodes = await this.prisma.mediaItem.findMany({
      where: { accountId: actor.accountId, type: 'episode', OR: candidates },
      select: mediaSelect,
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
    });
    const playableEpisodes = episodes.filter(playable);
    if (!playableEpisodes.length && anchor.type === 'episode' && playable(anchor)) playableEpisodes.push(anchor);
    const histories = actor.profileId && playableEpisodes.length
      ? await this.prisma.playbackHistory.findMany({
        where: { accountId: actor.accountId, profileId: actor.profileId, mediaId: { in: playableEpisodes.map((episode) => episode.id) } },
        select: { mediaId: true, positionMs: true, completed: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      })
      : [];
    const series = buildSeriesSeasons(playableEpisodes.map((episode) => ({
      id: episode.id,
      title: cleanLocalTitle(episode.title),
      overview: episode.overview,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      releaseYear: episode.releaseYear,
      stillPath: episode.episodeStillPath ?? episode.backdropPath,
      posterPath: episode.seasonPosterPath ?? episode.posterPath,
      durationMs: episode.file?.durationMs ?? null,
      markers: episode.timelineMarkers,
    })), histories, anchor.id);
    const representative = playableEpisodes[0] ?? anchor;
    return {
      mode: 'series',
      title: {
        ...base,
        displayTitle: seriesName,
        overview: anchor.seriesOverview ?? representative.seriesOverview ?? anchor.overview ?? representative.overview,
        posterPath: anchor.seasonPosterPath ?? representative.seasonPosterPath ?? anchor.posterPath ?? representative.posterPath,
        backdropPath: anchor.backdropPath ?? representative.backdropPath,
      },
      series,
      discovery: this.discovery(representative, seriesName),
    };
  }

  async person(actor: AuthenticatedUser, key: string) {
    const media = (await this.localCatalog(actor.accountId)).filter(playable);
    const identity = personIdentity(key);
    const matching = media.filter((item) => {
      const person = readLocalCredits(item.credits).find((credit) => identity.providerId
        ? credit.providerId === identity.providerId
        : slugifyDiscovery(credit.name) === identity.slug);
      return Boolean(person);
    });
    const matchedPerson = matching.flatMap((item) => readLocalCredits(item.credits)).find((credit) => identity.providerId
      ? credit.providerId === identity.providerId
      : slugifyDiscovery(credit.name) === identity.slug) ?? null;
    if (!matchedPerson || !matching.length) throw notFound('Personen har ingen lokale titler på denne server.');
    return {
      kind: 'person',
      key,
      title: matchedPerson.name,
      subtitle: matchedPerson.department ?? 'Medvirkende',
      imagePath: matchedPerson.profilePath,
      items: collapseTitles(matching),
    };
  }

  async collection(actor: AuthenticatedUser, key: string) {
    const media = (await this.localCatalog(actor.accountId)).filter(playable);
    let title = 'Samling';
    let subtitle = 'Titler fra dit lokale bibliotek';
    let matching: MediaRecord[] = [];
    if (key.startsWith('series-')) {
      const slug = key.slice('series-'.length);
      matching = media.filter((item) => slugifyDiscovery(item.seriesDisplayTitle ?? item.seriesTitle ?? '') === slug);
      const first = matching[0];
      title = first?.seriesDisplayTitle ?? first?.seriesTitle ?? 'Serie';
      subtitle = 'Alle tilgængelige sæsoner og episoder';
    } else if (key.startsWith('genre-')) {
      const slug = key.slice('genre-'.length);
      matching = media.filter((item) => readLocalGenres(item.genres).some((genre) => slugifyDiscovery(genre) === slug));
      const genre = matching.flatMap((item) => readLocalGenres(item.genres)).find((value) => slugifyDiscovery(value) === slug);
      title = genre ?? 'Genre';
      subtitle = 'Lokale titler i denne genre';
    } else if (key.startsWith('similar-')) {
      const sourceId = key.slice('similar-'.length);
      const source = media.find((item) => item.id === sourceId);
      if (source) {
        const providerIds = new Set(readSimilarProviderIds(source.similarProviderIds));
        matching = media.filter((item) => item.id === source.id || Boolean(item.metadataProviderId && providerIds.has(item.metadataProviderId)));
        title = `Lignende ${this.displayTitle(source)}`;
        subtitle = 'Provider-forslag, som findes lokalt på serveren';
      }
    }
    if (!matching.length) throw notFound('Samlingen indeholder ingen lokale afspillelige titler.');
    const representative = matching[0]!;
    return { kind: 'collection', key, title, subtitle, imagePath: representative.backdropPath ?? representative.posterPath, items: collapseTitles(matching) };
  }

  private localCatalog(accountId: string) {
    return this.prisma.mediaItem.findMany({ where: { accountId }, select: mediaSelect, orderBy: { updatedAt: 'desc' } });
  }

  private titleSummary(item: MediaRecord, seriesName: string | null) {
    return {
      id: item.id,
      displayTitle: seriesName ?? this.displayTitle(item),
      episodeTitle: item.type === 'episode' ? cleanLocalTitle(item.title) : null,
      type: item.type,
      releaseYear: item.releaseYear,
      overview: item.overview,
      rating: item.rating,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      genres: readLocalGenres(item.genres),
    };
  }

  private displayTitle(item: MediaRecord) {
    return item.seriesDisplayTitle ?? item.seriesTitle ?? cleanLocalTitle(item.title);
  }

  private discovery(item: MediaRecord, seriesName: string | null) {
    const collections = [
      ...(seriesName ? [{ key: `series-${slugifyDiscovery(seriesName)}`, label: seriesName, type: 'series' }] : []),
      ...readLocalGenres(item.genres).slice(0, 4).map((genre) => ({ key: `genre-${slugifyDiscovery(genre)}`, label: genre, type: 'genre' })),
      ...(readSimilarProviderIds(item.similarProviderIds).length ? [{ key: `similar-${item.id}`, label: 'Lignende titler', type: 'similar' }] : []),
    ];
    return { people: readLocalCredits(item.credits).slice(0, 15), collections };
  }
}

function collapseTitles(media: MediaRecord[]) {
  const groups = new Map<string, MediaRecord[]>();
  media.forEach((item) => {
    const seriesName = item.seriesDisplayTitle ?? item.seriesTitle;
    const key = item.type === 'episode' && seriesName
      ? `series:${item.seriesMetadataProviderId ?? slugifyDiscovery(seriesName)}`
      : `title:${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.values()].map((items) => {
    const sorted = [...items].sort((left, right) => (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0) || (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
    const item = sorted[0]!;
    const seriesName = item.seriesDisplayTitle ?? item.seriesTitle;
    return {
      mediaId: item.id,
      title: seriesName ?? cleanLocalTitle(item.title),
      type: seriesName ? 'series' : item.type,
      releaseYear: item.releaseYear,
      overview: item.seriesOverview ?? item.overview,
      rating: item.rating,
      posterPath: item.seasonPosterPath ?? item.posterPath,
      backdropPath: item.backdropPath,
      genres: readLocalGenres(item.genres),
      episodeCount: seriesName ? sorted.length : null,
    };
  }).sort((left, right) => (right.rating ?? 0) - (left.rating ?? 0) || (right.releaseYear ?? 0) - (left.releaseYear ?? 0) || left.title.localeCompare(right.title, 'da'));
}

function personIdentity(key: string) {
  const match = /^tmdb-([^-]+)-(.+)$/.exec(key);
  return match ? { providerId: match[1], slug: match[2] } : { providerId: null, slug: key.replace(/^name-/, '') };
}

function playable(item: MediaRecord) {
  return Boolean(item.file) && !['missing', 'error'].includes(String(item.file?.status));
}

function notFound(message: string) {
  return new NotFoundException({ code: 'experience_not_found', message });
}
