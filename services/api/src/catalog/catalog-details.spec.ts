import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

describe('series detail loading', () => {
  it('returns season summaries and loads media files for only the requested season', async () => {
    const seed = episode('episode-1', 1, 1);
    const requested = episode('episode-3', 2, 1);
    const prisma = {
      mediaItem: {
        findFirst: vi.fn().mockResolvedValue(seed),
        findMany: vi.fn()
          .mockResolvedValueOnce([
            { id: 'episode-1', title: 'Episode 1', episodeNumber: 1, seasonNumber: 1, seasonPosterPath: '/season-1.jpg', releaseYear: 2024 },
            { id: 'episode-2', title: 'Episode 2', episodeNumber: 2, seasonNumber: 1, seasonPosterPath: '/season-1.jpg', releaseYear: 2024 },
            { id: 'episode-3', title: 'Episode 1', episodeNumber: 1, seasonNumber: 2, seasonPosterPath: '/season-2.jpg', releaseYear: 2025 },
          ])
          .mockResolvedValueOnce([requested]),
      },
      playbackHistory: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const catalog = new CatalogService(prisma as never);

    const result = await catalog.getMediaDetails({ accountId: 'account-1' } as never, seed.id, 2);

    expect(result.kind).toBe('series');
    expect(result.item).toMatchObject({ title: 'Testserie', episodeCount: 3 });
    expect(result.seasons).toEqual([
      expect.objectContaining({ number: 1, episodeCount: 2, episodes: [] }),
      expect.objectContaining({ number: 2, episodeCount: 1, episodes: [expect.objectContaining({ id: requested.id })] }),
    ]);
    expect(prisma.mediaItem.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ seasonNumber: 2 }),
        include: expect.objectContaining({
          file: { select: expect.not.objectContaining({ probe: true }) },
        }),
      }),
    );
  });
});

function episode(id: string, seasonNumber: number, episodeNumber: number) {
  return {
    id,
    accountId: 'account-1',
    libraryId: 'library-1',
    title: `Episode ${episodeNumber}`,
    type: 'episode',
    codec: 'h264',
    container: 'mkv',
    bitrate: 4_000_000,
    width: 1920,
    height: 1080,
    category: 'Drama',
    seriesTitle: 'Testserie',
    seriesDisplayTitle: 'Testserie',
    seriesOverview: 'Serieoversigt',
    seriesMetadataProviderId: 'series-1',
    seasonNumber,
    seasonMetadataProviderId: `season-${seasonNumber}`,
    seasonPosterPath: `/season-${seasonNumber}.jpg`,
    episodeNumber,
    episodeStillPath: `/episode-${episodeNumber}.jpg`,
    releaseYear: 2024,
    overview: 'Episodeoversigt',
    rating: 8,
    metadataProvider: 'tvdb',
    metadataProviderId: id,
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    metadataUpdatedAt: new Date(),
    metadataLocked: false,
    genres: [],
    credits: [],
    similarProviderIds: [],
    recommendationUpdatedAt: null,
    releaseDate: new Date('2024-01-01T00:00:00.000Z'),
    availabilityOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    library: { id: 'library-1', name: 'Serier', type: 'series' },
    file: {
      id: `file-${id}`,
      accountId: 'account-1',
      libraryId: 'library-1',
      storageRootId: 'root-1',
      mediaItemId: id,
      relativePath: `${id}.mkv`,
      sizeBytes: 1000n,
      modifiedAt: new Date(),
      status: 'ready',
      container: 'matroska',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      durationMs: 2_700_000,
      bitrate: 4_000_000,
      probe: { streams: [] },
      lastSeenScanId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}
