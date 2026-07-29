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
};

type MetadataStats = { inspected: number; matched: number; unmatched: number };

export async function enrichLibraryMetadata(
  prisma: PrismaClient,
  input: {
    accountId: string;
    libraryId?: string;
    onlyMissing: boolean;
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
      ...(input.libraryId ? { libraryId: input.libraryId } : {}),
      type: {
        in: input.mediaType === 'movie' ? ['movie'] : input.mediaType === 'series' ? ['episode'] : ['movie', 'episode'],
      },
      ...(input.onlyMissing ? { metadataUpdatedAt: null } : {}),
    },
    orderBy: { updatedAt: 'asc' },
  });
  const needsTvdb = Boolean(settings.tvdbApiKey && items.some((item) => item.type === 'episode'));
  const tvdbToken = needsTvdb ? await loginTvdb(settings.tvdbApiKey!, settings.tvdbPin) : null;
  const cache = new Map<string, Promise<ProviderCandidate | null>>();
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
    const provider = movie ? 'tmdb' : tvdbToken ? 'tvdb' : 'tmdb';
    const credential = provider === 'tvdb' ? tvdbToken : settings.tmdbToken;
    if (!credential) {
      unmatched += 1;
      await input.onProgress();
      continue;
    }
    const cacheKey = `${provider}:${title}:${item.releaseYear ?? ''}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = provider === 'tvdb'
        ? searchTvdb(credential, settings.language, title, item.releaseYear)
        : searchTmdb(credential, settings.language, movie ? 'movie' : 'tv', title, item.releaseYear);
      cache.set(cacheKey, pending);
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
        overview: candidate.overview,
        rating: candidate.rating,
        metadataProvider: candidate.provider,
        metadataProviderId: String(candidate.id),
        posterPath: candidate.posterPath,
        backdropPath: candidate.backdropPath,
        metadataUpdatedAt: new Date(),
        releaseYear: item.releaseYear ?? candidate.releaseYear ?? null,
        releaseDate: item.releaseDate ?? candidate.releaseDate,
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
  return selectMetadataCandidate(candidates, title, year);
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
    if (!value || typeof value !== 'object') return [];
    const result = value as Record<string, unknown>;
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
    }];
  });
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

async function searchTvdb(
  token: string,
  language: string,
  title: string,
  year: number | null,
): Promise<ProviderCandidate | null> {
  const params = new URLSearchParams({ query: title, type: 'series', limit: '10', language: tvdbLanguage(language) });
  if (year) params.set('year', String(year));
  const response = await requestTvdb(`/search?${params}`, token);
  const payload = await response.json() as { data?: unknown[] };
  const candidates = (payload.data ?? []).flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const result = value as Record<string, unknown>;
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
    }];
  });
  const selected = selectMetadataCandidate(candidates, title, year);
  if (!selected) return null;
  const extendedResponse = await requestTvdb(`/series/${selected.id}/extended?short=true`, token);
  const extendedPayload = await extendedResponse.json() as { data?: Record<string, unknown> };
  const extended = extendedPayload.data;
  if (!extended) return selected;
  const releaseDate = parseDate(stringValue(extended.firstAired));
  return {
    ...selected,
    title: stringValue(extended.name) ?? selected.title,
    overview: stringValue(extended.overview) ?? selected.overview,
    posterPath: tvdbImageUrl(extended.image) ?? selected.posterPath,
    releaseDate,
    releaseYear: releaseDate?.getUTCFullYear() ?? integerValue(extended.year) ?? selected.releaseYear,
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

function tvdbLanguage(language: string): string {
  const iso = language.slice(0, 2).toLowerCase();
  return ({ da: 'dan', en: 'eng', de: 'deu', fr: 'fra', es: 'spa', no: 'nor', sv: 'swe' } as Record<string, string>)[iso] ?? 'eng';
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
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
