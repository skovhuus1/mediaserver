import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackHistoryService } from './playback-history.service';

const actor = {
  accountId: 'account-id',
  sub: 'user-id',
  profileId: 'profile-id',
};

describe('watchlist and watched state', () => {
  it('adds media idempotently inside the active account and profile', async () => {
    const createdAt = new Date('2026-08-19T10:00:00.000Z');
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue({ id: 'media-id', file: null }) },
      watchlistEntry: {
        upsert: vi.fn().mockResolvedValue({ mediaId: 'media-id', createdAt }),
      },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    await expect(service.addToWatchlist(actor as never, 'media-id')).resolves.toEqual({
      mediaId: 'media-id',
      inWatchlist: true,
      createdAt,
    });
    expect(prisma.mediaItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'media-id', accountId: 'account-id' },
    }));
    expect(prisma.watchlistEntry.upsert).toHaveBeenCalledWith({
      where: { profileId_mediaId: { profileId: 'profile-id', mediaId: 'media-id' } },
      create: {
        accountId: 'account-id',
        profileId: 'profile-id',
        mediaId: 'media-id',
      },
      update: {},
    });
  });

  it('marks a title watched without requiring an active playback session', async () => {
    const prisma = {
      mediaItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'media-id',
          file: { durationMs: 7_200_000 },
        }),
      },
      playbackHistory: {
        upsert: vi.fn().mockResolvedValue({ completed: true, positionMs: 7_200_000 }),
      },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    await expect(service.setWatched(actor as never, 'media-id', true)).resolves.toEqual({
      mediaId: 'media-id',
      watched: true,
      positionMs: 7_200_000,
    });
    expect(prisma.playbackHistory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        accountId: 'account-id',
        userId: 'user-id',
        profileId: 'profile-id',
        mediaId: 'media-id',
        positionMs: 7_200_000,
        completed: true,
      }),
      update: { positionMs: 7_200_000, completed: true },
    }));
  });

  it('removes a resume position only inside the active account, user and profile', async () => {
    const prisma = {
      playbackHistory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    await expect(service.removeFromContinueWatching(actor as never, 'media-id')).resolves.toEqual({
      mediaId: 'media-id',
      removed: true,
    });
    expect(prisma.playbackHistory.deleteMany).toHaveBeenCalledWith({
      where: {
        accountId: 'account-id',
        userId: 'user-id',
        profileId: 'profile-id',
        mediaId: 'media-id',
      },
    });
  });

  it('keeps removal idempotent when no resume position exists', async () => {
    const prisma = {
      playbackHistory: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    await expect(service.removeFromContinueWatching(actor as never, 'missing-media')).resolves.toEqual({
      mediaId: 'missing-media',
      removed: false,
    });
  });

  it('rejects requests without an active profile and cross-account media', async () => {
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue(null) },
      watchlistEntry: { upsert: vi.fn() },
    };
    const service = new PlaybackHistoryService(prisma as never, {} as never);

    await expect(service.addToWatchlist({ ...actor, profileId: undefined } as never, 'media-id'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addToWatchlist(actor as never, 'foreign-media-id'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.watchlistEntry.upsert).not.toHaveBeenCalled();
  });
});
