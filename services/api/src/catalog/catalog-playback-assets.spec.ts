import { playbackMarkerAnalysisVersion } from '@boltbytes/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

describe('catalog playback assets', () => {
  it('returns account-scoped markers and a path-free trickplay manifest', async () => {
    const now = new Date();
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue({ id: 'media-1', file: { status: 'ready', modifiedAt: now, durationMs: 120_000 } }) },
      mediaPlaybackAsset: { findUnique: vi.fn().mockResolvedValue({
        status: 'ready', sourceModifiedAt: now, updatedAt: now, generatedAt: now, error: null,
        intervalSeconds: 10, tileWidth: 320, tileHeight: 180, columns: 5, rows: 5,
        frameCount: 12, sheetCount: 1, durationMs: 120_000,
        manifest: {
          analysis: { markerAnalysisVersion: playbackMarkerAnalysisVersion },
          cues: [{ startMs: 0, endMs: 10_000, sheet: 0, column: 0, row: 0 }],
        },
      }) },
      mediaTimelineMarker: { findMany: vi.fn().mockResolvedValue([
        { id: 'marker-1', kind: 'recap', startMs: 0, endMs: 25_000, source: 'manual', confidence: 1 },
        { id: 'marker-2', kind: 'intro', startMs: 30_000, endMs: 70_000, source: 'manual', confidence: 1 },
      ]) },
    };
    const service = new CatalogService(prisma as never);
    const result = await service.getPlaybackAssets({ accountId: 'account-1' } as never, 'media-1');
    expect(result.status).toBe('ready');
    expect(result.markers).toEqual([
      expect.objectContaining({ kind: 'recap', source: 'manual' }),
      expect.objectContaining({ kind: 'intro', source: 'manual' }),
    ]);
    expect(result.trickplay).toMatchObject({ sheetCount: 1, cues: [expect.objectContaining({ sheet: 0 })] });
    expect(JSON.stringify(result)).not.toContain('spriteDirectory');
    expect(prisma.mediaTimelineMarker.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: 'account-1', mediaId: 'media-1' },
    }));
  });

  it('rejects a manual marker outside the media duration', async () => {
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue({ id: 'media-1', file: { durationMs: 60_000 } }) },
    };
    const service = new CatalogService(prisma as never);
    await expect(service.updateTimelineMarkers({ accountId: 'account-1' } as never, 'media-1', {
      intro: { startMs: 10_000, endMs: 90_000 },
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'invalid_timeline_marker' }) });
  });

  it('accepts manual recap markers through the catalog timeline endpoint', async () => {
    const tx = {
      mediaTimelineMarker: {
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue({ id: 'media-1', file: { status: 'ready', modifiedAt: new Date(), durationMs: 180_000 } }) },
      $transaction: vi.fn(async (callback) => callback(tx)),
      mediaPlaybackAsset: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'ready',
          manifest: { analysis: { markerAnalysisVersion: playbackMarkerAnalysisVersion }, cues: [] },
        }),
      },
      mediaTimelineMarker: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new CatalogService(prisma as never);
    await service.updateTimelineMarkers({ accountId: 'account-1' } as never, 'media-1', {
      recap: { startMs: 0, endMs: 30_000 },
    });
    expect(tx.mediaTimelineMarker.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'recap', source: 'manual' }),
    }));
  });

  it('bulk queues stale marker analyses atomically and skips fresh or active media', async () => {
    const now = new Date();
    const tx = {
      $queryRaw: vi.fn(),
      mediaItem: { findMany: vi.fn().mockResolvedValue([
        { id: 'fresh', file: { modifiedAt: now }, playbackAsset: { status: 'ready', sourceModifiedAt: now, manifest: { analysis: { markerAnalysisVersion: playbackMarkerAnalysisVersion } } } },
        { id: 'stale-analysis', file: { modifiedAt: now }, playbackAsset: { status: 'ready', sourceModifiedAt: now, manifest: { analysis: { markerAnalysisVersion: playbackMarkerAnalysisVersion - 1 } } } },
        { id: 'missing', file: { modifiedAt: now }, playbackAsset: null },
        { id: 'active', file: { modifiedAt: now }, playbackAsset: null },
      ]) },
      systemJob: {
        findMany: vi.fn().mockResolvedValue([{ payload: { mediaId: 'active', force: false } }]),
        createMany: vi.fn(),
      },
      mediaPlaybackAsset: { createMany: vi.fn(), updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      auditLog: { create: vi.fn() },
    };
    const service = new CatalogService(prisma as never);

    await expect(service.queuePlaybackAssetsBatch({ accountId: 'account-1' } as never, {
      mediaType: 'all',
      mode: 'missing',
    })).resolves.toEqual({ inspected: 4, queued: 2, skipped: 2, limited: false });

    expect(tx.mediaPlaybackAsset.createMany).toHaveBeenCalledWith({
      data: [
        { accountId: 'account-1', mediaId: 'stale-analysis', status: 'queued' },
        { accountId: 'account-1', mediaId: 'missing', status: 'queued' },
      ],
      skipDuplicates: true,
    });
    expect(tx.systemJob.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ payload: { mediaId: 'stale-analysis', force: true, analysisScope: 'marker_only' } }),
        expect.objectContaining({ payload: { mediaId: 'missing', force: false, analysisScope: 'full' } }),
      ],
    });
  });

  it('atomically replaces queued analysis jobs with series-first deterministic work', async () => {
    const now = new Date('2026-08-26T14:00:00.000Z');
    vi.setSystemTime(now);
    const item = (id: string, type: 'movie' | 'episode', seriesTitle: string | null, seasonNumber: number | null, episodeNumber: number | null) => ({
      id, type, seriesMetadataProviderId: null, seriesDisplayTitle: null, seriesTitle, seasonNumber, episodeNumber,
      file: { modifiedAt: now }, playbackAsset: null,
    });
    const tx = {
      $queryRaw: vi.fn(),
      mediaItem: { findMany: vi.fn().mockResolvedValue([
        item('movie-1', 'movie', null, null, null),
        item('series-b-2', 'episode', 'Zulu', 1, 2),
        item('series-a-2', 'episode', 'Alpha', 1, 2),
        item('series-a-1', 'episode', 'Alpha', 1, 1),
      ]) },
      systemJob: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'queued-job', status: 'queued', payload: { mediaId: 'series-a-1', force: true } },
          { id: 'running-job', status: 'running', payload: { mediaId: 'series-b-2', force: true } },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(),
      },
      mediaPlaybackAsset: { createMany: vi.fn(), updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      auditLog: { create: vi.fn() },
    };
    const service = new CatalogService(prisma as never);

    await expect(service.queuePlaybackAssetsBatch({ accountId: 'account-1' } as never, {
      mediaType: 'all', mode: 'all', replaceQueue: true,
    })).resolves.toEqual({ inspected: 4, queued: 3, skipped: 1, limited: false, cancelled: 1 });

    expect(tx.systemJob.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', id: { in: ['queued-job'] }, status: 'queued' },
      data: { status: 'cancelled', workerId: null, lockedAt: null, leaseExpiresAt: null },
    });
    const jobs = tx.systemJob.createMany.mock.calls[0]![0].data;
    expect(jobs.map((job: { payload: { mediaId: string } }) => job.payload.mediaId)).toEqual([
      'series-a-1', 'series-a-2', 'movie-1',
    ]);
    expect(jobs.map((job: { availableAt: Date }) => job.availableAt.getTime())).toEqual([
      now.getTime(), now.getTime() + 1, now.getTime() + 2,
    ]);
  });
});
