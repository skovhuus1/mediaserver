import { selectMetadataCandidate, type MetadataCandidate } from '@boltbytes/contracts';
import type { PrismaClient } from '@prisma/client';
import { decryptSecret } from './secret-value.js';

type TmdbCandidate = MetadataCandidate & {
  overview: string | null;
  rating: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date | null;
};

type MetadataStats = {
  inspected: number;
  matched: number;
  unmatched: number;
};

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
  const settings = await resolveTmdbSettings(prisma, input.accountId);
  const token = settings.token;
  if (!token) throw new Error('metadata_provider_disabled: TMDB_API_TOKEN is not configured');
  const language = settings.language;
  const items = await prisma.mediaItem.findMany({
    where: {
      accountId: input.accountId,
      ...(input.libraryId ? { libraryId: input.libraryId } : {}),
      type: {
        in: input.mediaType === 'movie'
          ? ['movie']
          : input.mediaType === 'series'
            ? ['episode']
            : ['movie', 'episode'],
      },
      ...(input.onlyMissing ? { metadataUpdatedAt: null } : {}),
    },
    orderBy: { updatedAt: 'asc' },
  });
  const cache = new Map<string, Promise<TmdbCandidate | null>>();
  let matched = 0;
  let unmatched = 0;
  for (const item of items) {
    const kind = item.type === 'movie' ? 'movie' : 'tv';
    const title = kind === 'movie' ? item.title : item.seriesTitle;
    if (!title) {
      unmatched += 1;
      continue;
    }
    const cacheKey = `${kind}:${title}:${item.releaseYear ?? ''}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = searchTmdb(token, language, kind, title, item.releaseYear);
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
        metadataProvider: 'tmdb',
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
  return Boolean((await resolveTmdbSettings(prisma, accountId)).token);
}

async function resolveTmdbSettings(prisma: PrismaClient, accountId: string) {
  const [tokenSetting, languageSetting] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: 'metadata.tmdb.token' } },
    }),
    prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: 'metadata.tmdb.language' } },
    }),
  ]);
  const languageValue = languageSetting?.value;
  const storedLanguage = languageValue && typeof languageValue === 'object' && !Array.isArray(languageValue)
    ? (languageValue as { value?: unknown }).value
    : null;
  return {
    token: tokenSetting
      ? decryptSecret(tokenSetting.value)
      : process.env.TMDB_API_TOKEN?.trim() || null,
    language: typeof storedLanguage === 'string'
      ? storedLanguage
      : process.env.TMDB_LANGUAGE?.trim() || 'da-DK',
  };
}

async function searchTmdb(
  token: string,
  language: string,
  kind: 'movie' | 'tv',
  title: string,
  year: number | null,
): Promise<TmdbCandidate | null> {
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
): Promise<TmdbCandidate[]> {
  const params = new URLSearchParams({
    query: title,
    include_adult: 'false',
    language,
    page: '1',
  });
  if (year) params.set(kind === 'movie' ? 'primary_release_year' : 'first_air_date_year', String(year));
  const response = await fetch(`https://api.themoviedb.org/3/search/${kind}?${params.toString()}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
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
    const originalTitle = stringValue(kind === 'movie' ? result.original_title : result.original_name);
    const dateValue = stringValue(kind === 'movie' ? result.release_date : result.first_air_date);
    const releaseDate = parseDate(dateValue);
    return [{
      id: result.id,
      title: displayTitle,
      originalTitle,
      releaseYear: releaseDate?.getUTCFullYear() ?? null,
      popularity: numberValue(result.popularity),
      overview: stringValue(result.overview),
      rating: numberValue(result.vote_average),
      posterPath: imagePath(result.poster_path),
      backdropPath: imagePath(result.backdrop_path),
      releaseDate,
    }];
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function imagePath(value: unknown): string | null {
  return typeof value === 'string' && /^\/[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
