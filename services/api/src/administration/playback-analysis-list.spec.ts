import { describe, expect, it, vi } from 'vitest';
import { AdministrationService } from './administration.service';

describe('playback analysis listing', () => {
  it('filters and paginates missing analyses in PostgreSQL', async () => {
    const prisma = {
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.playbackAsset ? 120 : 500)),
      },
      mediaPlaybackAsset: {
        groupBy: vi.fn().mockResolvedValue([
          { status: 'ready', _count: { _all: 350 } },
          { status: 'failed', _count: { _all: 20 } },
          { status: 'queued', _count: { _all: 10 } },
        ]),
      },
    };
    const service = new AdministrationService(prisma as never);
    const result = await service.listPlaybackAnalysis({ accountId: 'account-1' } as never, { status: 'missing', page: 3, take: 40 });

    expect(prisma.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: 'account-1', playbackAsset: { is: null } },
      skip: 80,
      take: 40,
    }));
    expect(result).toMatchObject({
      items: [], total: 120, page: 3, take: 40,
      counts: { all: 500, missing: 120, queued: 10, generating: 0, ready: 350, failed: 20 },
    });
  });

  it('keeps search and ready-state filtering inside account scope', async () => {
    const prisma = {
      mediaItem: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      mediaPlaybackAsset: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const service = new AdministrationService(prisma as never);
    await service.listPlaybackAnalysis({ accountId: 'account-1' } as never, { q: 'FBI', status: 'ready', page: 1, take: 10 });

    expect(prisma.mediaItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accountId: 'account-1', playbackAsset: { is: { status: 'ready' } }, OR: expect.any(Array) }),
      skip: 0,
      take: 10,
    }));
    expect(prisma.mediaPlaybackAsset.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ accountId: 'account-1', media: { is: expect.objectContaining({ OR: expect.any(Array) }) } }),
    }));
  });
});
