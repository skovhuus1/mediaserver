import { BadGatewayException, BadRequestException, ConflictException } from '@nestjs/common';

type ProviderSettings = {
  tmdbToken: string | null;
  tvdbApiKey: string | null;
  tvdbPin: string | null;
  language: string;
};

export type MetadataMatchCandidate = {
  provider: 'tmdb' | 'tvdb';
  providerId: string;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
  episodeOrders?: TvdbEpisodeOrder[];
};

export type TvdbEpisodeOrder = { key: string; label: string };

export async function searchMetadataProviders(
  settings: ProviderSettings,
  kind: 'movie' | 'series',
  query: string,
): Promise<MetadataMatchCandidate[]> {
  const requests: Array<Promise<MetadataMatchCandidate[]>> = [];
  if (settings.tmdbToken) requests.push(searchTmdb(settings.tmdbToken, settings.language, kind, query));
  if (kind === 'series' && settings.tvdbApiKey) {
    requests.push(searchTvdb(settings.tvdbApiKey, settings.tvdbPin, settings.language, query));
  }
  if (!requests.length) {
    throw new ConflictException({
      code: 'metadata_provider_disabled',
      message: kind === 'movie' ? 'TMDB skal konfigureres for at matche film.' : 'TMDB eller TVDB skal konfigureres for at matche serier.',
    });
  }
  const settled = await Promise.allSettled(requests);
  const candidates = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!candidates.length && settled.every((result) => result.status === 'rejected')) {
    throw new BadGatewayException({ code: 'metadata_provider_unavailable', message: 'Metadata-providerne kunne ikke gennemføre søgningen.' });
  }
  return candidates
    .sort((left, right) => (right.releaseYear ?? 0) - (left.releaseYear ?? 0) || left.title.localeCompare(right.title, 'da'))
    .slice(0, 24);
}

export async function validateMetadataSelection(
  settings: ProviderSettings,
  kind: 'movie' | 'series',
  provider: 'tmdb' | 'tvdb',
  providerId: string,
): Promise<MetadataMatchCandidate> {
  if (provider === 'tvdb' && kind !== 'series') {
    throw new BadRequestException({ code: 'metadata_provider_type_invalid', message: 'TVDB-match understøttes kun for serier.' });
  }
  if (provider === 'tmdb') {
    if (!settings.tmdbToken) throw new ConflictException({ code: 'metadata_provider_disabled', message: 'TMDB er ikke konfigureret.' });
    return getTmdb(settings.tmdbToken, settings.language, kind, providerId);
  }
  if (!settings.tvdbApiKey) throw new ConflictException({ code: 'metadata_provider_disabled', message: 'TVDB er ikke konfigureret.' });
  return getTvdb(settings.tvdbApiKey, settings.tvdbPin, settings.language, providerId);
}

export async function listTvdbEpisodeOrders(
  settings: ProviderSettings,
  providerId: string,
): Promise<TvdbEpisodeOrder[]> {
  if (!settings.tvdbApiKey) throw new ConflictException({ code: 'metadata_provider_disabled', message: 'TVDB er ikke konfigureret.' });
  const candidate = await getTvdb(settings.tvdbApiKey, settings.tvdbPin, settings.language, providerId);
  return candidate.episodeOrders ?? [{ key: 'default', label: 'Seriens standardorden' }];
}

export function parseTvdbEpisodeOrders(value: unknown): TvdbEpisodeOrder[] {
  const orders = new Map<string, TvdbEpisodeOrder>();
  orders.set('default', { key: 'default', label: 'Seriens standardorden' });
  for (const entry of Array.isArray(value) ? value : []) {
    const record = asObject(entry);
    const key = text(record.type)?.toLowerCase();
    if (!key || !/^[a-z0-9_-]{1,40}$/.test(key) || key === 'default' || orders.has(key)) continue;
    orders.set(key, {
      key,
      label: text(record.name) ?? text(record.alternateName) ?? key,
    });
  }
  return [...orders.values()];
}

export function resolveTvdbEpisodeOrder(
  available: TvdbEpisodeOrder[] | undefined,
  requested: string | undefined,
): string {
  const key = requested?.trim().toLowerCase() || 'default';
  const choices = available ?? [{ key: 'default', label: 'Seriens standardorden' }];
  if (!choices.some((choice) => choice.key === key)) {
    throw new BadRequestException({
      code: 'metadata_episode_order_invalid',
      message: 'Den valgte episodeorden findes ikke for denne TVDB-serie.',
    });
  }
  return key;
}

async function searchTmdb(token: string, language: string, kind: 'movie' | 'series', query: string) {
  const tmdbKind = kind === 'movie' ? 'movie' : 'tv';
  const params = new URLSearchParams({ query, include_adult: 'false', language, page: '1' });
  const payload = await tmdbRequest(token, `/search/${tmdbKind}?${params}`) as { results?: unknown[] };
  return (payload.results ?? []).flatMap((value) => parseTmdbCandidate(value, kind));
}

async function getTmdb(token: string, language: string, kind: 'movie' | 'series', providerId: string) {
  const tmdbKind = kind === 'movie' ? 'movie' : 'tv';
  const payload = await tmdbRequest(token, `/${tmdbKind}/${providerId}?language=${encodeURIComponent(language)}`);
  const candidate = parseTmdbCandidate(payload, kind)[0];
  if (!candidate) throw invalidSelection('TMDB');
  return candidate;
}

async function tmdbRequest(token: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => providerUnavailable('TMDB'));
  if (response.status === 404) throw invalidSelection('TMDB');
  if (!response.ok) throw providerHttp('TMDB', response.status);
  return response.json() as Promise<Record<string, unknown>>;
}

function parseTmdbCandidate(value: unknown, kind: 'movie' | 'series'): MetadataMatchCandidate[] {
  const record = asObject(value);
  const id = integer(record.id);
  const title = text(kind === 'movie' ? record.title : record.name);
  if (id === null || !title) return [];
  const date = text(kind === 'movie' ? record.release_date : record.first_air_date);
  return [{
    provider: 'tmdb',
    providerId: String(id),
    title,
    originalTitle: text(kind === 'movie' ? record.original_title : record.original_name),
    releaseYear: date && /^\d{4}/.test(date) ? Number.parseInt(date.slice(0, 4), 10) : null,
    overview: text(record.overview),
    posterPath: tmdbImage(record.poster_path),
  }];
}

async function searchTvdb(apikey: string, pin: string | null, language: string, query: string) {
  const token = await tvdbLogin(apikey, pin);
  const params = new URLSearchParams({ query, type: 'series', limit: '20', language: tvdbLanguage(language) });
  const payload = await tvdbRequest(token, `/search?${params}`) as { data?: unknown[] };
  return (payload.data ?? []).flatMap(parseTvdbCandidate);
}

async function getTvdb(apikey: string, pin: string | null, language: string, providerId: string) {
  const token = await tvdbLogin(apikey, pin);
  const payload = await tvdbRequest(token, `/series/${providerId}/extended?short=false&meta=translations`) as { data?: unknown };
  const record = asObject(payload.data);
  const id = integer(record.id);
  const title = text(record.name);
  if (id === null || !title) throw invalidSelection('TVDB');
  return {
    provider: 'tvdb' as const,
    providerId: String(id),
    title,
    originalTitle: null,
    releaseYear: integer(record.year),
    overview: text(record.overview),
    posterPath: tvdbImage(record.image),
    episodeOrders: parseTvdbEpisodeOrders(record.seasonTypes),
  };
}

function parseTvdbCandidate(value: unknown): MetadataMatchCandidate[] {
  const record = asObject(value);
  const id = integer(record.tvdb_id ?? record.id);
  const title = text(record.name_translated ?? record.name ?? record.title);
  if (id === null || !title) return [];
  return [{
    provider: 'tvdb',
    providerId: String(id),
    title,
    originalTitle: firstText(record.aliases),
    releaseYear: integer(record.year),
    overview: text(record.overview_translated ?? record.overview),
    posterPath: tvdbImage(record.image_url ?? record.poster ?? record.thumbnail),
  }];
}

async function tvdbLogin(apikey: string, pin: string | null): Promise<string> {
  const response = await fetch('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ apikey, ...(pin ? { pin } : {}) }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => providerUnavailable('TVDB'));
  if (!response.ok) throw providerHttp('TVDB', response.status);
  const payload = await response.json() as { data?: { token?: unknown } };
  if (typeof payload.data?.token !== 'string' || !payload.data.token) throw providerUnavailable('TVDB');
  return payload.data.token;
}

async function tvdbRequest(token: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api4.thetvdb.com/v4${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => providerUnavailable('TVDB'));
  if (response.status === 404) throw invalidSelection('TVDB');
  if (!response.ok) throw providerHttp('TVDB', response.status);
  return response.json() as Promise<Record<string, unknown>>;
}

function bindingObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const asObject = bindingObject;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const firstText = (value: unknown) => Array.isArray(value) ? value.map(text).find(Boolean) ?? null : null;
const integer = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
const tmdbImage = (value: unknown) => typeof value === 'string' && /^\/[A-Za-z0-9._-]+$/.test(value) ? value : null;
const tvdbImage = (value: unknown) => typeof value === 'string' && /^https:\/\/(?:artworks\.)?thetvdb\.com\/[A-Za-z0-9_./%-]+$/i.test(value) ? value : null;
const tvdbLanguage = (language: string) => ({ da: 'dan', en: 'eng', de: 'deu', fr: 'fra', es: 'spa', no: 'nor', sv: 'swe' } as Record<string, string>)[language.slice(0, 2).toLowerCase()] ?? 'eng';
const invalidSelection = (provider: string) => new BadRequestException({ code: 'metadata_match_invalid', message: `${provider}-valget findes ikke eller har forkert medietype.` });
const providerUnavailable = (provider: string): never => { throw new BadGatewayException({ code: 'metadata_provider_unavailable', message: `${provider} kunne ikke kontaktes.` }); };
const providerHttp = (provider: string, status: number) => new BadGatewayException({ code: 'metadata_provider_http_error', message: `${provider} svarede med HTTP ${status}.` });
