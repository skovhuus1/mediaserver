import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

describe('series catalog aggregation', () => {
  it('aggregates episode rows in the database and exposes one playable series card', async () => {
    const prisma = {
      $transaction: vi.fn().mockResolvedValue([[], []]),
      library: { findMany: vi.fn().mockResolvedValue([]) },
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([{
          seriesMetadataProviderId: 'series-1',
          seriesDisplayTitle: 'Testserien',
          seriesTitle: 'Testserien',
          seriesOverview: 'En samlet serie.',
          posterPath: null,
          seasonPosterPath: '/season-poster.jpg',
          backdropPath: '/backdrop.jpg',
          metadataProvider: 'tvdb',
          category: 'Drama',
          _count: { _all: 24 },
          _min: { id: 'episode-1', title: 'Pilot', releaseYear: 2024 },
          _max: { updatedAt: new Date('2026-08-17T12:00:00.000Z') },
        }]),
      },
    };
    const service = new CatalogService(prisma as never);

    const result = await service.listCatalog({ accountId: 'account-1' } as never, {
      type: 'series',
      page: 1,
      pageSize: 24,
      sort: 'newest',
    });

    expect(result.items).toEqual([expect.objectContaining({
      id: 'episode-1',
      title: 'Testserien',
      posterPath: '/season-poster.jpg',
      episodeCount: 24,
    })]);
    expect(prisma.mediaItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: 'episode',
        file: { is: { status: 'ready' } },
        AND: [expect.objectContaining({
          OR: expect.arrayContaining([
            { seriesTitle: { not: null } },
            { seriesDisplayTitle: { not: null } },
            { seriesMetadataProviderId: { not: null } },
          ]),
        })],
      }),
      _count: { _all: true },
    }));
  });

  it('reuses category and library facets across catalog pages for the same account', async () => {
    const prisma = {
      $transaction: vi.fn().mockResolvedValue([[{ category: 'Drama' }], [{ id: 'library-1', name: 'Film', type: 'movie' }]]),
      library: { findMany: vi.fn().mockResolvedValue([]) },
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new CatalogService(prisma as never);

    await service.listCatalog({ accountId: 'account-1' } as never, {
      type: 'movie', page: 1, pageSize: 24, sort: 'newest',
    });
    await service.listCatalog({ accountId: 'account-1' } as never, {
      type: 'movie', page: 2, pageSize: 24, sort: 'newest',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.library.findMany).toHaveBeenCalledTimes(1);
  });

  it('sorts aggregated series by their latest episode release date', async () => {
    const prisma = {
      $transaction: vi.fn().mockResolvedValue([[], []]),
      library: { findMany: vi.fn().mockResolvedValue([]) },
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn().mockResolvedValue([
          {
            seriesMetadataProviderId: 'older-series',
            seriesDisplayTitle: 'Ældre serie',
            seriesTitle: 'Ældre serie',
            seriesOverview: null,
            posterPath: null,
            backdropPath: null,
            metadataProvider: 'tvdb',
            category: 'Drama',
            _count: { _all: 10 },
            _min: { id: 'older-episode', title: 'Pilot', releaseYear: 2024 },
            _max: {
              releaseDate: new Date('2024-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-08-24T12:00:00.000Z'),
            },
          },
          {
            seriesMetadataProviderId: 'newer-series',
            seriesDisplayTitle: 'Ny serie',
            seriesTitle: 'Ny serie',
            seriesOverview: null,
            posterPath: null,
            backdropPath: null,
            metadataProvider: 'tvdb',
            category: 'Krimi',
            _count: { _all: 8 },
            _min: { id: 'newer-episode', title: 'Premiere', releaseYear: 2025 },
            _max: {
              releaseDate: new Date('2025-08-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          },
        ]),
      },
    };
    const service = new CatalogService(prisma as never);

    const result = await service.listCatalog({ accountId: 'account-1' } as never, {
      type: 'series',
      page: 1,
      pageSize: 24,
      sort: 'released',
    });

    expect(result.items.map((item: { title: string }) => item.title)).toEqual([
      'Ny serie',
      'Ældre serie',
    ]);
    expect(prisma.mediaItem.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      _max: { updatedAt: true, releaseDate: true },
    }));
  });

  it('orders episodes by release date before release year and title', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
      library: { findMany: vi.fn().mockResolvedValue([]) },
      mediaItem: {
        findMany,
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new CatalogService(prisma as never);

    await service.listCatalog({ accountId: 'account-1' } as never, {
      type: 'episode',
      page: 1,
      pageSize: 24,
      sort: 'released',
    });

    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ releaseDate: 'desc' }, { releaseYear: 'desc' }, { title: 'asc' }],
    }));
  });
});
