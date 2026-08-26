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
          analysis: { markerAnalysisVersion: 3 },
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
          manifest: { analysis: { markerAnalysisVersion: 3 }, cues: [] },
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
        { id: 'fresh', file: { modifiedAt: now }, playbackAsset: { status: 'ready', sourceModifiedAt: now, manifest: { analysis: { markerAnalysisVersion: 3 } } } },
        { id: 'stale-analysis', file: { modifiedAt: now }, playbackAsset: { status: 'ready', sourceModifiedAt: now, manifest: { analysis: { markerAnalysisVersion: 2 } } } },
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
        expect.objectContaining({ payload: { mediaId: 'stale-analysis', force: true } }),
        expect.objectContaining({ payload: { mediaId: 'missing', force: false } }),
      ],
    });
  });
});
