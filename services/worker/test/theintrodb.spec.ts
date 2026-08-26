import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupIntroDbMarkers } from '../src/theintrodb.js';

const originalEnvironment = {
  enabled: process.env.BB_MEDIA_THEINTRODB_ENABLED,
  baseUrl: process.env.BB_MEDIA_THEINTRODB_BASE_URL,
  apiKey: process.env.BB_MEDIA_THEINTRODB_API_KEY,
  timeoutMs: process.env.BB_MEDIA_THEINTRODB_TIMEOUT_MS,
};

afterEach(() => {
  restoreEnvironment('BB_MEDIA_THEINTRODB_ENABLED', originalEnvironment.enabled);
  restoreEnvironment('BB_MEDIA_THEINTRODB_BASE_URL', originalEnvironment.baseUrl);
  restoreEnvironment('BB_MEDIA_THEINTRODB_API_KEY', originalEnvironment.apiKey);
  restoreEnvironment('BB_MEDIA_THEINTRODB_TIMEOUT_MS', originalEnvironment.timeoutMs);
  vi.unstubAllGlobals();
});

describe('TheIntroDB playback markers', () => {
  it('looks up an episode by its series TMDB id and normalizes all supported markers', async () => {
    process.env.BB_MEDIA_THEINTRODB_ENABLED = 'true';
    process.env.BB_MEDIA_THEINTRODB_BASE_URL = 'https://intro.test/v3';
    process.env.BB_MEDIA_THEINTRODB_API_KEY = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      recap: [{ start_ms: 0, end_ms: 42_000, confidence: 0.91 }],
      intro: [
        { start_ms: 55_000, end_ms: 112_000, confidence: 0.72 },
        { start_ms: 58_000, end_ms: 110_000, confidence: 0.96 },
      ],
      credits: [{ start_ms: 2_510_000, end_ms: null, confidence: 0.88 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupIntroDbMarkers({
      type: 'episode',
      metadataProvider: 'tmdb',
      metadataProviderId: 'episode-id',
      seriesMetadataProviderId: '1399',
      seasonNumber: 2,
      episodeNumber: 4,
    }, 2_600_000);

    const request = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(request.origin + request.pathname).toBe('https://intro.test/v3/media');
    expect(request.searchParams.get('tmdb_id')).toBe('1399');
    expect(request.searchParams.get('season')).toBe('2');
    expect(request.searchParams.get('episode')).toBe('4');
    expect(request.searchParams.get('duration_ms')).toBe('2600000');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(result.markers).toEqual([
      expect.objectContaining({ kind: 'recap', startMs: 0, endMs: 42_000, source: 'external' }),
      expect.objectContaining({ kind: 'intro', startMs: 58_000, endMs: 110_000, source: 'external' }),
      expect.objectContaining({ kind: 'credits', startMs: 2_510_000, endMs: 2_600_000, source: 'external' }),
    ]);
  });

  it('treats an unknown TheIntroDB title as an empty fail-soft lookup', async () => {
    process.env.BB_MEDIA_THEINTRODB_ENABLED = 'true';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupIntroDbMarkers({
      type: 'movie',
      metadataProvider: 'imdb',
      metadataProviderId: 'tt1234567',
      seriesMetadataProviderId: null,
      seasonNumber: null,
      episodeNumber: null,
    }, 7_200_000);

    expect(result.markers).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not contact TheIntroDB when the provider is disabled', async () => {
    process.env.BB_MEDIA_THEINTRODB_ENABLED = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupIntroDbMarkers({
      type: 'episode',
      metadataProvider: 'tvdb',
      metadataProviderId: 'episode-id',
      seriesMetadataProviderId: '81189',
      seasonNumber: 1,
      episodeNumber: 1,
    }, 2_700_000);

    expect(result.markers).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
