import { describe, expect, it, vi } from 'vitest';
import { PlaybackHistoryService } from './playback-history.service';

const actor = {
  accountId: 'account-id',
  sub: 'user-id',
  profileId: 'profile-id',
};

function fixture() {
  const session = {
    id: 'session-id',
    accountId: actor.accountId,
    userId: actor.sub,
    profileId: actor.profileId,
    mediaId: 'media-id',
    status: 'active',
    media: { file: { durationMs: 100_000 } },
  };
  const prisma = {
    playbackSession: { findFirst: vi.fn().mockResolvedValue(session) },
    playbackHistory: {
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({
        id: 'history-id',
        mediaId: create.mediaId,
        positionMs: create.positionMs,
        completed: create.completed,
        updatedAt: new Date('2026-08-25T00:00:00.000Z'),
      })),
    },
  };
  const reservations = { release: vi.fn().mockResolvedValue({ released: true }) };
  const redis = { delete: vi.fn().mockResolvedValue(1) };
  return {
    service: new PlaybackHistoryService(prisma as never, reservations as never, redis as never),
    prisma,
    reservations,
    redis,
  };
}

describe('playback progress lifecycle', () => {
  it('marks ninety percent as watched without releasing the active stream', async () => {
    const { service, reservations, redis } = fixture();

    await expect(service.updateProgress(actor as never, 'session-id', {
      positionMs: 95_000,
      durationMs: 100_000,
    })).resolves.toMatchObject({ completed: true, positionMs: 95_000 });

    expect(reservations.release).not.toHaveBeenCalled();
    expect(redis.delete).toHaveBeenCalledTimes(1);
  });

  it('releases the active stream only for an explicit player completion signal', async () => {
    const { service, reservations } = fixture();

    await service.updateProgress(actor as never, 'session-id', {
      positionMs: 100_000,
      durationMs: 100_000,
      completed: true,
    });

    expect(reservations.release).toHaveBeenCalledWith(actor, 'session-id', 'completed');
  });
});
