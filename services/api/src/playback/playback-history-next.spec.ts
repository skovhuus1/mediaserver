import { describe, expect, it, vi } from 'vitest';
import { PlaybackHistoryService } from './playback-history.service';

describe('next series episode', () => {
  it('groups by provider id, skips completed episodes and returns the first remaining episode', async () => {
    const first = episode('episode-1', 1, 1);
    const second = episode('episode-2', 1, 2);
    const prisma = {
      mediaItem: { findMany: vi.fn().mockResolvedValue([first, second]) },
      playbackHistory: {
        findMany: vi.fn().mockResolvedValue([
          { mediaId: first.id, completed: true, positionMs: 0, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
        ]),
      },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    const result = await service.nextEpisode({
      accountId: 'account-id',
      sub: 'user-id',
      profileId: 'profile-id',
    } as never, {
      seriesTitle: 'different scanner title',
      seriesDisplayTitle: 'Foundation',
      seriesMetadataProviderId: '366972',
    });

    expect(result).toMatchObject({
      media: {
        id: second.id,
        seriesTitle: 'Foundation',
        seasonNumber: 1,
        episodeNumber: 2,
        hdr: 'hdr10',
      },
      resumePositionMs: 0,
    });
    expect(result?.media.file).not.toHaveProperty('probe');
    expect(prisma.mediaItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ seriesMetadataProviderId: '366972' }),
      }),
    );
  });

  it('returns the episode immediately after the completed player item', async () => {
    const first = episode('episode-1', 1, 1);
    const second = episode('episode-2', 1, 2);
    const third = episode('episode-3', 1, 3);
    const prisma = {
      mediaItem: { findMany: vi.fn().mockResolvedValue([first, second, third]) },
      playbackHistory: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    const result = await service.nextEpisode({
      accountId: 'account-id',
      sub: 'user-id',
      profileId: 'profile-id',
    } as never, {
      seriesMetadataProviderId: '366972',
      afterMediaId: second.id,
    });

    expect(result?.media.id).toBe(third.id);
    expect(result?.resumePositionMs).toBe(0);
  });
});

function episode(id: string, seasonNumber: number, episodeNumber: number) {
  return {
    id,
    accountId: 'account-id',
    libraryId: 'library-id',
    title: `Episode ${episodeNumber}`,
    type: 'episode',
    codec: 'hevc',
    container: 'mkv',
    bitrate: 20_000_000,
    width: 3840,
    height: 2160,
    category: 'Drama',
    seriesTitle: 'Foundation',
    seriesDisplayTitle: 'Foundation',
    seriesOverview: 'A science fiction series.',
    seriesMetadataProviderId: '366972',
    seasonNumber,
    seasonMetadataProviderId: 'season-id',
    seasonPosterPath: null,
    episodeNumber,
    episodeStillPath: null,
    releaseYear: 2021,
    overview: 'Episode overview.',
    rating: null,
    metadataProvider: 'tvdb',
    metadataProviderId: `tvdb-${id}`,
    posterPath: null,
    backdropPath: null,
    metadataUpdatedAt: new Date(),
    releaseDate: new Date('2021-01-01T00:00:00.000Z'),
    availabilityOverride: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    library: { id: 'library-id', name: 'Series', type: 'series' },
    file: {
      id: `file-${id}`,
      sizeBytes: 1000n,
      durationMs: 3_600_000,
      probe: {
        streams: [{
          codec_type: 'video',
          codec_name: 'hevc',
          pix_fmt: 'yuv420p10le',
          color_primaries: 'bt2020',
          color_transfer: 'smpte2084',
        }],
      },
    },
  };
}
