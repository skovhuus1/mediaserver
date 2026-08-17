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
        manifest: { cues: [{ startMs: 0, endMs: 10_000, sheet: 0, column: 0, row: 0 }] },
      }) },
      mediaTimelineMarker: { findMany: vi.fn().mockResolvedValue([{ id: 'marker-1', kind: 'intro', startMs: 10_000, endMs: 70_000, source: 'manual', confidence: 1 }]) },
    };
    const service = new CatalogService(prisma as never);
    const result = await service.getPlaybackAssets({ accountId: 'account-1' } as never, 'media-1');
    expect(result.status).toBe('ready');
    expect(result.markers).toEqual([expect.objectContaining({ kind: 'intro', source: 'manual' })]);
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
});
