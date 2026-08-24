import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { detectVideoSignalProfile, type AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildSeriesSeasons,
  cleanLocalTitle,
  readLocalCredits,
  readLocalGenres,
  readSimilarProviderIds,
  scoreRelatedTitle,
  scoreSearchMatch,
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
  codec: true,
  container: true,
  bitrate: true,
  width: true,
  height: true,
  file: { select: { status: true, durationMs: true, width: true, height: true, bitrate: true, container: true, videoCodec: true, audioCodec: true, probe: true } },
  timelineMarkers: {
    select: { kind: true, startMs: true, endMs: true, source: true },
    orderBy: { startMs: 'asc' },
  },
});

type MediaRecord = Prisma.MediaItemGetPayload<{ select: typeof mediaSelect }>;

@Injectable()
export class ExperienceService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actor: AuthenticatedUser, rawQuery: string) {
    const query = String(rawQuery ?? '').trim().slice(0, 80);
    if (query.length < 2) return { query, total: 0, groups: { titles: [], episodes: [], people: [], genres: [] } };
    const media = (await this.localCatalog(actor.accountId)).filter(playable);
    const titles = collapseTitles(media).flatMap((item) => {
      const score = scoreSearchMatch(query, [item.title, item.overview, ...item.genres]);
      return score > 0 ? [{ ...item, score, matchReason: titleMatchReason(query, item) }] : [];
    }).sort((left, right) => right.score - left.score || (right.rating ?? 0) - (left.rating ?? 0)).slice(0, 12);

    const episodes = media.filter((item) => item.type === 'episode').flatMap((item) => {
      const title = cleanLocalTitle(item.title);
      const seriesTitle = item.seriesDisplayTitle ?? item.seriesTitle ?? 'Serie';
      const genres = readLocalGenres(item.genres);
      const score = scoreSearchMatch(query, [title, seriesTitle, item.overview, ...genres]);
      return score > 0 ? [{
        mediaId: item.id,
        title,
        seriesTitle,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        releaseYear: item.releaseYear,
        imagePath: item.episodeStillPath ?? item.backdropPath ?? item.posterPath,
        matchReason: `${seriesTitle}${item.seasonNumber !== null && item.episodeNumber !== null ? ` · S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}` : ''}`,
        score,
      }] : [];
    }).sort((left, right) => right.score - left.score || left.matchReason.localeCompare(right.matchReason, 'da')).slice(0, 12);

    const peopleByKey = new Map<string, { person: ReturnType<typeof readLocalCredits>[number]; titleKeys: Set<string> }>();
    const genresByKey = new Map<string, { name: string; titleKeys: Set<string>; imagePath: string | null }>();
    media.forEach((item) => {
      const titleKey = mediaGroupKey(item);
      readLocalCredits(item.credits).forEach((person) => {
        const current = peopleByKey.get(person.key) ?? { person, titleKeys: new Set<string>() };
        current.titleKeys.add(titleKey);
        if (!current.person.profilePath && person.profilePath) current.person = person;
        peopleByKey.set(person.key, current);
      });
      readLocalGenres(item.genres).forEach((genre) => {
        const key = slugifyDiscovery(genre);
        const current = genresByKey.get(key) ?? { name: genre, titleKeys: new Set<string>(), imagePath: item.backdropPath ?? item.posterPath };
        current.titleKeys.add(titleKey);
        if (!current.imagePath) current.imagePath = item.backdropPath ?? item.posterPath;
        genresByKey.set(key, current);
      });
    });
    const people = [...peopleByKey.values()].flatMap(({ person, titleKeys }) => {
      const score = scoreSearchMatch(query, [person.name, person.role, person.department]);
      return score > 0 ? [{ key: person.key, name: person.name, role: person.role, department: person.department, profilePath: person.profilePath, titleCount: titleKeys.size, score }] : [];
    }).sort((left, right) => right.score - left.score || right.titleCount - left.titleCount || left.name.localeCompare(right.name, 'da')).slice(0, 8);
    const genres = [...genresByKey.entries()].flatMap(([key, genre]) => {
      const score = scoreSearchMatch(query, [genre.name]);
      return score > 0 ? [{ key: `genre-${key}`, name: genre.name, titleCount: genre.titleKeys.size, imagePath: genre.imagePath, score }] : [];
    }).sort((left, right) => right.score - left.score || right.titleCount - left.titleCount || left.name.localeCompare(right.name, 'da')).slice(0, 8);
    return { query, total: titles.length + episodes.length + people.length + genres.length, groups: { titles, episodes, people, genres } };
  }

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
      const [history, related] = await Promise.all([
        actor.profileId ? this.prisma.playbackHistory.findUnique({ where: { profileId_mediaId: { profileId: actor.profileId, mediaId: anchor.id } }, select: { positionMs: true, completed: true, updatedAt: true } }) : null,
        this.relatedTitles(actor.accountId, anchor, null),
      ]);
      return { mode: 'title', title: base, playback: this.playbackSummary(anchor, history), discovery: this.discovery(anchor, null), related };
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
      playback: this.playbackMedia(episode),
    })), histories, anchor.id);
    const representative = playableEpisodes[0] ?? anchor;
    const related = await this.relatedTitles(actor.accountId, representative, seriesName);
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
      related,
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
      durationMs: item.file?.durationMs ?? null,
      width: item.file?.width ?? item.width,
      height: item.file?.height ?? item.height,
      bitrate: item.file?.bitrate ?? item.bitrate,
      container: item.file?.container ?? item.container,
      videoCodec: item.file?.videoCodec ?? item.codec,
      audioCodec: item.file?.audioCodec ?? null,
      hdr: detectVideoSignalProfile(item.file?.probe).hdr,
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

  private playbackMedia(item: MediaRecord) {
    return { id: item.id, title: cleanLocalTitle(item.title), type: item.type, seriesTitle: item.seriesTitle, seriesDisplayTitle: item.seriesDisplayTitle, seriesMetadataProviderId: item.seriesMetadataProviderId, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, releaseYear: item.releaseYear, category: item.category, overview: item.overview, posterPath: item.posterPath, backdropPath: item.backdropPath, width: item.file?.width ?? item.width, height: item.file?.height ?? item.height, hdr: detectVideoSignalProfile(item.file?.probe).hdr, file: { durationMs: item.file?.durationMs ?? null } };
  }

  private playbackSummary(item: MediaRecord, history: { positionMs: number; completed: boolean; updatedAt: Date } | null) {
    const durationMs = item.file?.durationMs ?? null;
    const completed = Boolean(history?.completed) || Boolean(durationMs && history && history.positionMs / durationMs >= 0.9);
    const positionMs = completed ? 0 : history?.positionMs ?? 0;
    return { media: this.playbackMedia(item), positionMs, completed, progressPercent: durationMs && positionMs ? Math.max(0, Math.min(100, Math.round((positionMs / durationMs) * 100))) : 0, lastPlayedAt: history?.updatedAt.toISOString() ?? null };
  }

  private async relatedTitles(accountId: string, source: MediaRecord, seriesName: string | null) {
    const media = (await this.localCatalog(accountId)).filter(playable);
    const sourceSignal = relatedSignal(source);
    const similarIds = new Set(readSimilarProviderIds(source.similarProviderIds));
    const groups = new Map<string, MediaRecord[]>();
    for (const item of media) {
      if (item.id === source.id) continue;
      const itemSeries = item.seriesDisplayTitle ?? item.seriesTitle;
      if (seriesName && itemSeries?.toLocaleLowerCase('da') === seriesName.toLocaleLowerCase('da')) continue;
      const key = item.type === 'episode' && itemSeries ? `series:${item.seriesMetadataProviderId ?? slugifyDiscovery(itemSeries)}` : `title:${item.id}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.values()].flatMap((items) => {
      const ranked = items.map((item) => ({ item, ...scoreRelatedTitle(sourceSignal, relatedSignal(item), similarIds) })).sort((left, right) => right.score - left.score)[0];
      if (!ranked || ranked.score <= 0) return [];
      const collapsed = collapseTitles(items)[0];
      return collapsed ? [{ ...collapsed, reason: ranked.reason, score: ranked.score }] : [];
    }).sort((left, right) => right.score - left.score || (right.rating ?? 0) - (left.rating ?? 0)).slice(0, 12);
  }
}

function relatedSignal(item: MediaRecord) {
  return { providerId: item.seriesMetadataProviderId ?? item.metadataProviderId, category: item.category, genres: readLocalGenres(item.genres), people: readLocalCredits(item.credits).map((person) => person.key), rating: item.rating };
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

function mediaGroupKey(item: MediaRecord) {
  const seriesName = item.seriesDisplayTitle ?? item.seriesTitle;
  return item.type === 'episode' && seriesName
    ? `series:${item.seriesMetadataProviderId ?? slugifyDiscovery(seriesName)}`
    : `title:${item.id}`;
}

function titleMatchReason(query: string, item: ReturnType<typeof collapseTitles>[number]) {
  if (scoreSearchMatch(query, [item.title]) > 0) return item.type === 'series' ? 'Serie' : 'Titel';
  const genre = item.genres.find((value) => scoreSearchMatch(query, [value]) > 0);
  return genre ? `Genre · ${genre}` : 'Beskrivelse';
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
