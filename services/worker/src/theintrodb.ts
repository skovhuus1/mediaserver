import type { TimelineMarker, TimelineMarkerKind } from '@boltbytes/contracts';

const defaultBaseUrl = 'https://api.theintrodb.org/v3';
const defaultTimeoutMs = 3_500;
const maxTimeoutMs = 12_000;
const maxTimestampMs = 21_600_000;
const markerKinds: TimelineMarkerKind[] = ['recap', 'intro', 'credits'];

export type TheIntroDbMedia = {
  type: string;
  metadataProvider: string | null;
  metadataProviderId: string | null;
  seriesMetadataProviderId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

export type TheIntroDbLookupSummary = {
  provider: 'theintrodb';
  enabled: boolean;
  status: 'disabled' | 'skipped' | 'matched' | 'empty' | 'failed';
  query: Record<string, string | number> | null;
  segments: Partial<Record<TimelineMarkerKind, number>>;
  error: string | null;
};

export type TheIntroDbLookupResult = {
  markers: TimelineMarker[];
  summary: TheIntroDbLookupSummary;
};

export async function lookupIntroDbMarkers(media: TheIntroDbMedia, durationMs: number): Promise<TheIntroDbLookupResult> {
  const disabled = disabledByEnvironment();
  const emptySummary = (status: TheIntroDbLookupSummary['status'], query: Record<string, string | number> | null, error: string | null = null): TheIntroDbLookupResult => ({
    markers: [],
    summary: { provider: 'theintrodb', enabled: !disabled, status, query, segments: {}, error },
  });
  if (disabled) return emptySummary('disabled', null);

  const query = buildIntroDbQuery(media, durationMs);
  if (!query) return emptySummary('skipped', null);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), introDbTimeoutMs());
  try {
    const url = new URL(`${introDbBaseUrl()}/media`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const apiKey = process.env.BB_MEDIA_THEINTRODB_API_KEY?.trim();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
    if (response.status === 404) return emptySummary('empty', query);
    if (!response.ok) return emptySummary('failed', query, `TheIntroDB returned HTTP ${response.status}`);
    const body = await response.json();
    const parsed = parseIntroDbMarkers(body, durationMs);
    return {
      markers: parsed.markers,
      summary: {
        provider: 'theintrodb',
        enabled: true,
        status: parsed.markers.length ? 'matched' : 'empty',
        query,
        segments: parsed.segments,
        error: null,
      },
    };
  } catch (error) {
    return emptySummary('failed', query, error instanceof Error ? error.message : 'TheIntroDB lookup failed');
  } finally {
    clearTimeout(timeout);
  }
}

function buildIntroDbQuery(media: TheIntroDbMedia, durationMs: number): Record<string, string | number> | null {
  const provider = media.metadataProvider?.trim().toLocaleLowerCase('en-US') ?? '';
  const query: Record<string, string | number> = {};
  if (media.type === 'episode') {
    const season = positiveInteger(media.seasonNumber);
    const episode = positiveInteger(media.episodeNumber);
    if (season === null || episode === null) return null;
    if (provider === 'tmdb') {
      const tmdbId = positiveIntegerString(media.seriesMetadataProviderId);
      if (tmdbId === null) return null;
      query.tmdb_id = tmdbId;
    } else if (provider === 'tvdb') {
      const tvdbId = positiveIntegerString(media.seriesMetadataProviderId);
      if (tvdbId === null) return null;
      query.tvdb_id = tvdbId;
    } else {
      return null;
    }
    query.season = season;
    query.episode = episode;
  } else if (media.type === 'movie') {
    if (provider === 'tmdb') {
      const tmdbId = positiveIntegerString(media.metadataProviderId);
      if (tmdbId === null) return null;
      query.tmdb_id = tmdbId;
    } else if (provider === 'tvdb') {
      const tvdbId = positiveIntegerString(media.metadataProviderId);
      if (tvdbId === null) return null;
      query.tvdb_id = tvdbId;
    } else if (provider === 'imdb') {
      const imdbId = imdbIdentifier(media.metadataProviderId);
      if (!imdbId) return null;
      query.imdb_id = imdbId;
    } else {
      return null;
    }
  } else {
    return null;
  }

  const normalizedDuration = positiveInteger(durationMs);
  if (normalizedDuration !== null && normalizedDuration <= maxTimestampMs) query.duration_ms = normalizedDuration;
  return query;
}

function parseIntroDbMarkers(body: unknown, durationMs: number): {
  markers: TimelineMarker[];
  segments: Partial<Record<TimelineMarkerKind, number>>;
} {
  const media = jsonObject(body);
  const markers: TimelineMarker[] = [];
  const segments: Partial<Record<TimelineMarkerKind, number>> = {};
  for (const kind of markerKinds) {
    const candidates = Array.isArray(media[kind])
      ? media[kind].flatMap((value) => normalizeSegment(kind, value, durationMs))
      : [];
    if (candidates.length) {
      segments[kind] = candidates.length;
      markers.push(candidates.sort((left, right) => markerScore(right) - markerScore(left))[0]!);
    }
  }
  return { markers, segments };
}

function normalizeSegment(kind: TimelineMarkerKind, value: unknown, durationMs: number): TimelineMarker[] {
  const segment = jsonObject(value);
  const start = nullableMilliseconds(segment.start_ms);
  const end = nullableMilliseconds(segment.end_ms);
  const startMs = Math.max(0, start ?? 0);
  const endMs = end ?? (kind === 'credits' ? durationMs : null);
  if (endMs === null) return [];
  const clampedEndMs = Math.min(Math.max(0, Math.round(durationMs)), endMs);
  if (clampedEndMs <= startMs + 1_000) return [];
  return [{
    kind,
    startMs,
    endMs: clampedEndMs,
    source: 'external',
    confidence: confidence(segment),
  }];
}

function markerScore(marker: TimelineMarker): number {
  return (marker.confidence ?? 0.82) * 10_000 - marker.startMs / 10_000_000;
}

function confidence(segment: Record<string, unknown>): number {
  const direct = typeof segment.confidence === 'number' && Number.isFinite(segment.confidence)
    ? Math.max(0, Math.min(1, segment.confidence))
    : null;
  if (direct !== null) return direct;
  const submissions = typeof segment.submission_count === 'number' && Number.isFinite(segment.submission_count)
    ? Math.max(0, Math.round(segment.submission_count))
    : 0;
  return Math.min(0.96, 0.82 + submissions * 0.02);
}

function nullableMilliseconds(value: unknown): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function positiveIntegerString(value: string | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10_000_000 ? parsed : null;
}

function imdbIdentifier(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && /^tt\d{7,8}$/.test(trimmed) ? trimmed : null;
}

function introDbBaseUrl(): string {
  return (process.env.BB_MEDIA_THEINTRODB_BASE_URL?.trim() || defaultBaseUrl).replace(/\/+$/, '');
}

function introDbTimeoutMs(): number {
  const parsed = Number(process.env.BB_MEDIA_THEINTRODB_TIMEOUT_MS);
  return Number.isFinite(parsed)
    ? Math.max(500, Math.min(maxTimeoutMs, Math.round(parsed)))
    : defaultTimeoutMs;
}

function disabledByEnvironment(): boolean {
  const value = process.env.BB_MEDIA_THEINTRODB_ENABLED?.trim().toLocaleLowerCase('en-US');
  return value === '0' || value === 'false' || value === 'off';
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
