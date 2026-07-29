import { afterEach, describe, expect, it, vi } from 'vitest';
import { metadataSettingsStatus, resolveMetadataSettings } from './metadata-settings';

describe('metadata settings', () => {
  const originalEnvironment = {
    tmdb: process.env.TMDB_API_TOKEN,
    tvdb: process.env.TVDB_API_KEY,
    pin: process.env.TVDB_SUBSCRIBER_PIN,
    language: process.env.TMDB_LANGUAGE,
  };

  afterEach(() => {
    process.env.TMDB_API_TOKEN = originalEnvironment.tmdb;
    process.env.TVDB_API_KEY = originalEnvironment.tvdb;
    process.env.TVDB_SUBSCRIBER_PIN = originalEnvironment.pin;
    process.env.TMDB_LANGUAGE = originalEnvironment.language;
    vi.restoreAllMocks();
  });

  it('reports TVDB as the configured series provider without exposing credentials', async () => {
    delete process.env.TMDB_API_TOKEN;
    process.env.TVDB_API_KEY = 'tvdb-test-api-key';
    process.env.TVDB_SUBSCRIBER_PIN = '1234';
    process.env.TMDB_LANGUAGE = 'da-DK';
    const prisma = {
      systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const runtime = await resolveMetadataSettings(prisma as never, 'account-id');
    const status = await metadataSettingsStatus(prisma as never, 'account-id');

    expect(runtime.tvdbApiKey).toBe('tvdb-test-api-key');
    expect(runtime.tvdbPin).toBe('1234');
    expect(status).toMatchObject({
      enabled: true,
      provider: 'tvdb',
      language: 'da-DK',
      providers: {
        tmdb: { enabled: false, source: 'none' },
        tvdb: { enabled: true, source: 'environment' },
      },
    });
    expect(status).not.toHaveProperty('tvdbApiKey');
    expect(status).not.toHaveProperty('tvdbPin');
  });
});
