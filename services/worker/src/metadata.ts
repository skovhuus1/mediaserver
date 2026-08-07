import { selectMetadataCandidate, type MetadataCandidate } from '@boltbytes/contracts';
import type { PrismaClient } from '@prisma/client';
import { decryptSecret } from './secret-value.js';

type ProviderCandidate = MetadataCandidate & {
  provider: 'tmdb' | 'tvdb';
  overview: string | null;
  rating: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date | null;
  genres: string[];
  credits: Array<{ id: string; name: string; character: string | null }>;
  similarProviderIds: string[];
};

type TvdbSeasonMetadata = {
  id: number;
  number: number;
  name: string | null;
  posterPath: string | null;
  priority: number;
};

type TvdbEpisodeMetadata = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  stillPath: string | null;
  airedAt: Date | null;
};

type TvdbSeriesMatch = {
  series: ProviderCandidate;
  seasons: Map<number, TvdbSeasonMetadata>;
  episodes: Map<string, TvdbEpisodeMetadata>;
};

type MetadataStats = { inspected: number; matched: number; unmatched: number };

export async function enrichLibraryMetadata(
  prisma: PrismaClient,
  input: {
    accountId: string;
    libraryId?: string;
    mediaId?: string;
    seriesTitle?: string;
    onlyMissing: boolean;
    force?: boolean;
    mediaType?: 'all' | 'movie' | 'series';
    onProgress: () => Promise<void>;
  },
): Promise<MetadataStats> {
  const settings = await resolveMetadataSettings(prisma, input.accountId);
  if (!settings.tmdbToken && !settings.tvdbApiKey) {
    throw new Error('metadata_provider_disabled: TMDB or TVDB is not configured');
  }
  const items = await prisma.mediaItem.findMany({
    where: {
      accountId: input.accountId,
      ...(input.mediaId ? { id: input.mediaId } : {}),
      ...(input.libraryId ? { libraryId: input.libraryId } : {}),
      ...(input.seriesTitle ? { seriesTitle: { equals: input.seriesTitle, mode: 'insensitive' } } : {}),
      ...(!input.force ? { metadataLocked: false } : {}),
      type: {
        in: input.mediaType === 'movie' ? ['movie'] : input.mediaType === 'series' ? ['episode'] : ['movie', 'episode'],
      },
      ...(input.onlyMissing ? { metadataUpdatedAt: null } : {}),
    },
    orderBy: { updatedAt: 'asc' },
  });
  const needsTvdb = Boolean(settings.tvdbApiKey && items.some((item) => item.type === 'episode'));
  const tvdbToken = needsTvdb ? await loginTvdb(settings.tvdbApiKey!, settings.tvdbPin) : null;
  const tmdbCache = new Map<string, Promise<ProviderCandidate | null>>();
  const tvdbCache = new Map<string, Promise<TvdbSeriesMatch | null>>();
  const bindings = await prisma.metadataBinding.findMany({
    where: { accountId: input.accountId },
  });
  const bindingMap = new Map(bindings.map((binding) => [
    `${binding.libraryId}:${binding.mediaType}:${binding.localKey}`,
    binding,
  ]));
  let matched = 0;
  let unmatched = 0;

  for (const item of items) {
    const movie = item.type === 'movie';
    const title = movie ? item.title : item.seriesTitle;
    if (!title) {
      unmatched += 1;
      await input.onProgress();
      continue;
    }

    const bindingType = movie ? 'movie' : 'series';
    const bindingLocalKey = movie
      ? item.id
      : title.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const binding = bindingMap.get(`${item.libraryId}:${bindingType}:${bindingLocalKey}`);
    if (binding?.provider === 'tvdb') {
      if (movie) throw new Error('manual_metadata_binding_invalid: TVDB cannot be used for movies');
      if (!tvdbToken) throw new Error('manual_metadata_provider_disabled: TVDB is required by the saved match');
      const cacheKey = `manual:${binding.providerId}`;
      let pending = tvdbCache.get(cacheKey);
      if (!pending) {
        pending = getTvdbSeriesById(tvdbToken, settings.language, Number.parseInt(binding.providerId, 10));
        tvdbCache.set(cacheKey, pending);
      }
      const match = await pending;
      if (!match) throw new Error('manual_metadata_match_missing: Saved TVDB series no longer exists');
      const episode = item.seasonNumber !== null && item.episodeNumber !== null
        ? match.episodes.get(episodeKey(item.seasonNumber, item.episodeNumber)) ?? null
        : null;
      const season = item.seasonNumber !== null ? match.seasons.get(item.seasonNumber) ?? null : null;
      const tmdbFeatures = settings.tmdbToken
        ? await searchTmdb(settings.tmdbToken, settings.language, 'tv', match.series.title, match.series.releaseYear ?? null).catch(() => null)
        : null;
      await prisma.mediaItem.update({
        where: { id: item.id },
        data: {
          title: episode?.title ?? item.title,
          overview: episode?.overview ?? item.overview ?? match.series.overview,
          rating: null,
          metadataProvider: 'tvdb',
          metadataProviderId: episode ? String(episode.id) : null,
          seriesDisplayTitle: match.series.title,
          seriesOverview: match.series.overview,
          seriesMetadataProviderId: String(match.series.id),
          seasonMetadataProviderId: season ? String(season.id) : null,
          seasonPosterPath: season?.posterPath ?? null,
          episodeStillPath: episode?.stillPath ?? null,
          posterPath: match.series.posterPath,
          backdropPath: match.series.backdropPath,
          metadataUpdatedAt: new Date(),
          metadataLocked: binding.locked,
          releaseYear: item.releaseYear ?? match.series.releaseYear ?? null,
          releaseDate: episode?.airedAt ?? item.releaseDate,
          genres: tmdbFeatures?.genres ?? match.series.genres,
          credits: tmdbFeatures?.credits ?? match.series.credits,
          similarProviderIds: tmdbFeatures
            ? [`tmdb:${tmdbFeatures.id}`, ...tmdbFeatures.similarProviderIds]
            : match.series.similarProviderIds,
          recommendationUpdatedAt: new Date(),
        },
      });
      matched += 1;
      await input.onProgress();
      continue;
    }
    if (binding?.provider === 'tmdb') {
      if (!settings.tmdbToken) throw new Error('manual_metadata_provider_disabled: TMDB is required by the saved match');
      const kind = movie ? 'movie' : 'tv';
      const cacheKey = `manual:${kind}:${binding.providerId}`;
      let pending = tmdbCache.get(cacheKey);
      if (!pending) {
        pending = getTmdbById(settings.tmdbToken, settings.language, kind, Number.parseInt(binding.providerId, 10));
        tmdbCache.set(cacheKey, pending);
      }
      const candidate = await pending;
      if (!candidate) throw new Error('manual_metadata_match_missing: Saved TMDB title no longer exists');
      await prisma.mediaItem.update({
        where: { id: item.id },
        data: {
          overview: movie ? candidate.overview : item.overview ?? candidate.overview,
          rating: candidate.rating,
          metadataProvider: 'tmdb',
          metadataProviderId: String(candidate.id),
          seriesDisplayTitle: movie ? null : candidate.title,
          seriesOverview: movie ? null : candidate.overview,
          seriesMetadataProviderId: movie ? null : String(candidate.id),
          seasonMetadataProviderId: null,
          seasonPosterPath: null,
          episodeStillPath: null,
          posterPath: candidate.posterPath,
          backdropPath: candidate.backdropPath,
          metadataUpdatedAt: new Date(),
          metadataLocked: binding.locked,
          releaseYear: item.releaseYear ?? candidate.releaseYear ?? null,
          releaseDate: item.releaseDate ?? candidate.releaseDate,
          genres: candidate.genres,
          credits: candidate.credits,
          similarProviderIds: candidate.similarProviderIds,
          recommendationUpdatedAt: new Date(),
        },
      });
      matched += 1;
      await input.onProgress();
      continue;
    }

    if (!movie && tvdbToken) {
      const cacheKey = `${title}:${item.releaseYear ?? ''}`;
      let pending = tvdbCache.get(cacheKey);
      if (!pending) {
        pending = searchTvdbSeries(tvdbToken, settings.language, title, item.releaseYear);
        tvdbCache.set(cacheKey, pending);
      }
      const match = await pending;
      if (!match) {
        unmatched += 1;
        await input.onProgress();
        continue;
      }
      const episode = item.seasonNumber !== null && item.episodeNumber !== null
        ? match.episodes.get(episodeKey(item.seasonNumber, item.episodeNumber)) ?? null
        : null;
      const season = item.seasonNumber !== null ? match.seasons.get(item.seasonNumber) ?? null : null;
      const tmdbFeatures = settings.tmdbToken
        ? await searchTmdb(
            settings.tmdbToken,
            settings.language,
            'tv',
            match.series.title,
            match.series.releaseYear ?? null,
          ).catch(() => null)
        : null;
      await prisma.mediaItem.update({
        where: { id: item.id },
        data: {
          title: episode?.title ?? item.title,
          overview: episode?.overview ?? item.overview ?? match.series.overview,
          rating: null,
          metadataProvider: 'tvdb',
          metadataProviderId: episode ? String(episode.id) : null,
          seriesDisplayTitle: match.series.title,
          seriesOverview: match.series.overview,
          seriesMetadataProviderId: String(match.series.id),
          seasonMetadataProviderId: season ? String(season.id) : null,
          seasonPosterPath: season?.posterPath ?? null,
          episodeStillPath: episode?.stillPath ?? null,
          posterPath: match.series.posterPath,
          backdropPath: match.series.backdropPath,
          metadataUpdatedAt: new Date(),
          releaseYear: item.releaseYear ?? match.series.releaseYear ?? null,
          releaseDate: episode?.airedAt ?? item.releaseDate,
          genres: tmdbFeatures?.genres ?? match.series.genres,
          credits: tmdbFeatures?.credits ?? match.series.credits,
          similarProviderIds:
            tmdbFeatures
              ? [`tmdb:${tmdbFeatures.id}`, ...tmdbFeatures.similarProviderIds]
              : match.series.similarProviderIds,
          recommendationUpdatedAt: new Date(),
        },
      });
      matched += 1;
      await input.onProgress();
      continue;
    }

    const token = settings.tmdbToken;
    if (!token) {
      unmatched += 1;
      await input.onProgress();
      continue;
    }
    const kind = movie ? 'movie' : 'tv';
    const cacheKey = `${kind}:${title}:${item.releaseYear ?? ''}`;
    let pending = tmdbCache.get(cacheKey);
    if (!pending) {
      pending = searchTmdb(token, settings.language, kind, title, item.releaseYear);
      tmdbCache.set(cacheKey, pending);
    }
    const candidate = await pending;
    if (!candidate) {
      unmatched += 1;
      await input.onProgress();
      continue;
    }
    await prisma.mediaItem.update({
      where: { id: item.id },
      data: {
        overview: movie ? candidate.overview : item.overview ?? candidate.overview,
        rating: candidate.rating,
        metadataProvider: 'tmdb',
        metadataProviderId: String(candidate.id),
        seriesDisplayTitle: movie ? null : candidate.title,
        seriesOverview: movie ? null : candidate.overview,
        seriesMetadataProviderId: movie ? null : String(candidate.id),
        seasonMetadataProviderId: null,
        seasonPosterPath: null,
        episodeStillPath: null,
        posterPath: candidate.posterPath,
        backdropPath: candidate.backdropPath,
        metadataUpdatedAt: new Date(),
        releaseYear: item.releaseYear ?? candidate.releaseYear ?? null,
        releaseDate: item.releaseDate ?? candidate.releaseDate,
        genres: candidate.genres,
        credits: candidate.credits,
        similarProviderIds: candidate.similarProviderIds,
        recommendationUpdatedAt: new Date(),
      },
    });
    matched += 1;
    await input.onProgress();
  }
  return { inspected: items.length, matched, unmatched };
}

export async function hasTmdbConfiguration(prisma: PrismaClient, accountId: string): Promise<boolean> {
  const settings = await resolveMetadataSettings(prisma, accountId);
  return Boolean(settings.tmdbToken || settings.tvdbApiKey);
}

async function resolveMetadataSettings(prisma: PrismaClient, accountId: string) {
  const [tmdbSetting, languageSetting, tvdbSetting, tvdbPinSetting] = await Promise.all([
    setting(prisma, accountId, 'metadata.tmdb.token'),
    setting(prisma, accountId, 'metadata.tmdb.language'),
    setting(prisma, accountId, 'metadata.tvdb.apikey'),
    setting(prisma, accountId, 'metadata.tvdb.pin'),
  ]);
  const languageValue = languageSetting?.value;
  const storedLanguage = languageValue && typeof languageValue === 'object' && !Array.isArray(languageValue)
    ? (languageValue as { value?: unknown }).value
    : null;
  return {
    tmdbToken: tmdbSetting ? decryptSecret(tmdbSetting.value) : process.env.TMDB_API_TOKEN?.trim() || null,
    tvdbApiKey: tvdbSetting ? decryptSecret(tvdbSetting.value) : process.env.TVDB_API_KEY?.trim() || null,
    tvdbPin: tvdbPinSetting ? decryptSecret(tvdbPinSetting.value) : process.env.TVDB_SUBSCRIBER_PIN?.trim() || null,
    language: typeof storedLanguage === 'string' ? storedLanguage : process.env.TMDB_LANGUAGE?.trim() || 'da-DK',
  };
}

function setting(prisma: PrismaClient, accountId: string, key: string) {
  return prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key } } });
}

async function searchTmdb(
  token: string,
  language: string,
  kind: 'movie' | 'tv',
  title: string,
  year: number | null,
): Promise<ProviderCandidate | null> {
  const first = await requestTmdb(token, language, kind, title, year);
  const candidates = first.length || !year ? first : await requestTmdb(token, language, kind, title, null);
  const selected = selectMetadataCandidate(candidates, title, year);
  if (!selected) return null;
  const features = await requestTmdbRecommendationFeatures(
    token,
    language,
    kind,
    selected.id,
  ).catch(() => ({ genres: [], credits: [], similarProviderIds: [] }));
  return { ...selected, ...features };
}

async function getTmdbById(
  token: string,
  language: string,
  kind: 'movie' | 'tv',
  providerId: number,
): Promise<ProviderCandidate | null> {
  if (!Number.isInteger(providerId) || providerId < 1) return null;
  const response = await fetch(
    `https://api.themoviedb.org/3/${kind}/${providerId}?language=${encodeURIComponent(language)}`,
    {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`metadata_provider_http_${response.status}: TMDB details failed`);
  const result = await response.json() as Record<string, unknown>;
  const title = stringValue(kind === 'movie' ? result.title : result.name);
  if (!title) return null;
  const releaseDate = parseDate(stringValue(kind === 'movie' ? result.release_date : result.first_air_date));
  const features = await requestTmdbRecommendationFeatures(token, language, kind, providerId)
    .catch(() => ({ genres: [], credits: [], similarProviderIds: [] }));
  return {
    id: providerId,
    provider: 'tmdb',
    title,
    originalTitle: stringValue(kind === 'movie' ? result.original_title : result.original_name),
    releaseYear: releaseDate?.getUTCFullYear() ?? null,
    popularity: numberValue(result.popularity),
    overview: stringValue(result.overview),
    rating: numberValue(result.vote_average),
    posterPath: tmdbImagePath(result.poster_path),
    backdropPath: tmdbImagePath(result.backdrop_path),
    releaseDate,
    ...features,
  };
}

async function requestTmdb(
  token: string,
  language: string,
  kind: 'movie' | 'tv',
  title: string,
  year: number | null,
): Promise<ProviderCandidate[]> {
  const params = new URLSearchParams({ query: title, include_adult: 'false', language, page: '1' });
  if (year) params.set(kind === 'movie' ? 'primary_release_year' : 'first_air_date_year', String(year));
  const response = await fetch(`https://api.themoviedb.org/3/search/${kind}?${params}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`metadata_provider_http_${response.status}: TMDB search failed`);
  const payload = await response.json() as { results?: unknown[] };
  return (payload.results ?? []).flatMap((value) => {
    const result = asObject(value);
    if (typeof result.id !== 'number') return [];
    const displayTitle = stringValue(kind === 'movie' ? result.title : result.name);
    if (!displayTitle) return [];
    const releaseDate = parseDate(stringValue(kind === 'movie' ? result.release_date : result.first_air_date));
    return [{
      id: result.id,
      provider: 'tmdb' as const,
      title: displayTitle,
      originalTitle: stringValue(kind === 'movie' ? result.original_title : result.original_name),
      releaseYear: releaseDate?.getUTCFullYear() ?? null,
      popularity: numberValue(result.popularity),
      overview: stringValue(result.overview),
      rating: numberValue(result.vote_average),
      posterPath: tmdbImagePath(result.poster_path),
      backdropPath: tmdbImagePath(result.backdrop_path),
      releaseDate,
      genres: [],
      credits: [],
      similarProviderIds: [],
    }];
  });
}

async function requestTmdbRecommendationFeatures(
  token: string,
  language: string,
  kind: 'movie' | 'tv',
  providerId: number,
) {
  const request = async (suffix: string) => {
    const response = await fetch(
      `https://api.themoviedb.org/3/${kind}/${providerId}${suffix}?language=${encodeURIComponent(language)}&page=1`,
      {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(
        `metadata_provider_http_${response.status}: TMDB recommendation metadata failed`,
      );
    }
    return response.json() as Promise<Record<string, unknown>>;
  };
  const [detailsResult, creditsResult, similarResult] = await Promise.allSettled([
    request(''),
    request('/credits'),
    request('/similar'),
  ]);
  const details = detailsResult.status === 'fulfilled' ? detailsResult.value : {};
  const creditsPayload =
    creditsResult.status === 'fulfilled' ? creditsResult.value : {};
  const similar = similarResult.status === 'fulfilled' ? similarResult.value : {};
  const genres = Array.isArray(details.genres)
    ? details.genres
        .map(asObject)
        .map((genre) => stringValue(genre.name))
        .filter((genre): genre is string => Boolean(genre))
    : [];
  const credits = Array.isArray(creditsPayload.cast)
    ? creditsPayload.cast.slice(0, 15).flatMap((value) => {
        const credit = asObject(value);
        const id = integerValue(credit.id);
        const name = stringValue(credit.name);
        if (id === null || !name) return [];
        return [{
          id: `tmdb:${id}`,
          name,
          character: stringValue(credit.character),
        }];
      })
    : [];
  const similarProviderIds = Array.isArray(similar.results)
    ? similar.results.flatMap((value) => {
        const id = integerValue(asObject(value).id);
        return id === null ? [] : [`tmdb:${id}`];
      })
    : [];
  return { genres, credits, similarProviderIds };
}

async function loginTvdb(apikey: string, pin: string | null): Promise<string> {
  const response = await fetch('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ apikey, ...(pin ? { pin } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`metadata_provider_http_${response.status}: TVDB login failed`);
  const payload = await response.json() as { data?: { token?: unknown } };
  if (typeof payload.data?.token !== 'string' || !payload.data.token) {
    throw new Error('metadata_provider_invalid_response: TVDB login token missing');
  }
  return payload.data.token;
}

async function searchTvdbSeries(
  token: string,
  language: string,
  title: string,
  year: number | null,
): Promise<TvdbSeriesMatch | null> {
  const candidates = await requestTvdbSearch(token, language, title, year);
  const selected = selectMetadataCandidate(candidates, title, year);
  if (!selected) return null;
  return getTvdbSeriesById(token, language, selected.id, selected);
}

async function getTvdbSeriesById(
  token: string,
  language: string,
  seriesId: number,
  selected?: ProviderCandidate,
): Promise<TvdbSeriesMatch | null> {
  if (!Number.isInteger(seriesId) || seriesId < 1) return null;
  const response = await requestTvdb(`/series/${seriesId}/extended?short=false`, token);
  const payload = await response.json() as { data?: Record<string, unknown> };
  const extended = payload.data ?? {};
  const extendedTitle = stringValue(extended.name);
  if (!extendedTitle) return null;
  const artworks = parseTvdbArtwork(extended.artworks);
  const releaseDate = parseDate(stringValue(extended.firstAired));
  const fallback: ProviderCandidate = selected ?? {
    id: seriesId,
    provider: 'tvdb',
    title: extendedTitle,
    originalTitle: null,
    releaseYear: integerValue(extended.year),
    popularity: null,
    overview: stringValue(extended.overview),
    rating: null,
    posterPath: tvdbImageUrl(extended.image),
    backdropPath: null,
    releaseDate,
    genres: [],
    credits: [],
    similarProviderIds: [],
  };
  const series: ProviderCandidate = {
    ...fallback,
    title: extendedTitle,
    overview: stringValue(extended.overview) ?? fallback.overview,
    posterPath: artworks.poster ?? tvdbImageUrl(extended.image) ?? fallback.posterPath,
    backdropPath: artworks.backdrop,
    releaseDate,
    releaseYear: releaseDate?.getUTCFullYear() ?? integerValue(extended.year) ?? fallback.releaseYear ?? null,
  };
  const seasons = parseTvdbSeasons(extended.seasons);
  const episodes = await fetchTvdbEpisodes(seriesId, token, language);
  return { series, seasons, episodes };
}

async function requestTvdbSearch(
  token: string,
  language: string,
  title: string,
  year: number | null,
): Promise<ProviderCandidate[]> {
  const params = new URLSearchParams({ query: title, type: 'series', limit: '10', language: tvdbLanguage(language) });
  if (year) params.set('year', String(year));
  const response = await requestTvdb(`/search?${params}`, token);
  const payload = await response.json() as { data?: unknown[] };
  return (payload.data ?? []).flatMap((value) => {
    const result = asObject(value);
    const id = integerValue(result.tvdb_id ?? result.id);
    const name = stringValue(result.name_translated ?? result.name ?? result.title);
    if (id === null || !name) return [];
    return [{
      id,
      provider: 'tvdb' as const,
      title: name,
      originalTitle: firstString(result.aliases),
      releaseYear: integerValue(result.year),
      popularity: null,
      overview: stringValue(result.overview_translated ?? result.overview),
      rating: null,
      posterPath: tvdbImageUrl(result.image_url ?? result.poster ?? result.thumbnail),
      backdropPath: null,
      releaseDate: null,
      genres: [],
      credits: [],
      similarProviderIds: [],
    }];
  });
}

async function fetchTvdbEpisodes(
  seriesId: number,
  token: string,
  language: string,
): Promise<Map<string, TvdbEpisodeMetadata>> {
  const episodes = new Map<string, TvdbEpisodeMetadata>();
  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ page: String(page) });
    const response = await requestTvdb(
      `/series/${seriesId}/episodes/default/${tvdbLanguage(language)}?${params}`,
      token,
    );
    const payload = await response.json() as {
      data?: { episodes?: unknown[] };
      links?: { next?: unknown };
    };
    for (const value of payload.data?.episodes ?? []) {
      const record = asObject(value);
      const id = integerValue(record.id);
      const seasonNumber = integerValue(record.seasonNumber ?? record.season_number);
      const episodeNumber = integerValue(record.number ?? record.episodeNumber ?? record.episode_number);
      if (id === null || seasonNumber === null || episodeNumber === null) continue;
      episodes.set(episodeKey(seasonNumber, episodeNumber), {
        id,
        seasonNumber,
        episodeNumber,
        title: stringValue(record.name),
        overview: stringValue(record.overview),
        stillPath: tvdbImageUrl(record.image),
        airedAt: parseDate(stringValue(record.aired)),
      });
    }
    if (!stringValue(payload.links?.next)) break;
  }
  return episodes;
}

function parseTvdbSeasons(value: unknown): Map<number, TvdbSeasonMetadata> {
  const records = (Array.isArray(value) ? value : []).flatMap((entry) => {
    const season = asObject(entry);
    const id = integerValue(season.id);
    const number = integerValue(season.number);
    if (id === null || number === null) return [];
    const type = asObject(season.type);
    const typeName = `${stringValue(type.name) ?? ''} ${stringValue(type.type) ?? ''}`.toLowerCase();
    const priority = typeName.includes('aired') || typeName.includes('official') || typeName.includes('default') ? 2 : 1;
    return [{
      id,
      number,
      name: stringValue(season.name),
      posterPath: tvdbImageUrl(season.image),
      priority,
    }];
  }).sort((left, right) => right.priority - left.priority);
  const seasons = new Map<number, TvdbSeasonMetadata>();
  for (const season of records) if (!seasons.has(season.number)) seasons.set(season.number, season);
  return seasons;
}

function parseTvdbArtwork(value: unknown): { poster: string | null; backdrop: string | null } {
  const artwork = (Array.isArray(value) ? value : []).flatMap((entry) => {
    const record = asObject(entry);
    const image = tvdbImageUrl(record.image);
    if (!image) return [];
    return [{ image, width: integerValue(record.width) ?? 0, height: integerValue(record.height) ?? 0 }];
  });
  return {
    poster: artwork.find((entry) => entry.height > entry.width)?.image ?? null,
    backdrop: artwork.find((entry) => entry.width > entry.height)?.image ?? null,
  };
}

async function requestTvdb(path: string, token: string): Promise<Response> {
  const response = await fetch(`https://api4.thetvdb.com/v4${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`metadata_provider_http_${response.status}: TVDB request failed`);
  return response;
}

function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

function tvdbLanguage(language: string): string {
  const iso = language.slice(0, 2).toLowerCase();
  return ({ da: 'dan', en: 'eng', de: 'deu', fr: 'fra', es: 'spa', no: 'nor', sv: 'swe' } as Record<string, string>)[iso] ?? 'eng';
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(value: unknown): string | null {
  return Array.isArray(value) ? value.map(stringValue).find(Boolean) ?? null : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integerValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function tmdbImagePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

function tvdbImageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/(?:artworks\.)?thetvdb\.com\/[A-Za-z0-9_./%-]+$/i.test(value)
    ? value
    : null;
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
