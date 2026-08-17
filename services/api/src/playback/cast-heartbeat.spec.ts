import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { StreamReservationService } from './stream-reservation.service';

describe('Chromecast heartbeat', () => {
  it('renews only a cast session carrying the matching stream token', async () => {
    const token = 'cast-stream-token';
    const prisma = {
      playbackSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          status: 'active',
          runtimeState: 'starting',
          isCastSession: true,
          streamTokenHash: createHash('sha256').update(token).digest('hex'),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = Object.assign(Object.create(StreamReservationService.prototype), {
      prisma,
      leaseSeconds: 90,
    }) as StreamReservationService;

    await expect(service.heartbeatWithToken('session-1', token, {
      runtimeState: 'playing',
      positionMs: 12_000,
      currentBitrate: 6_000_000,
      currentHeight: 1080,
      stallCount: 2,
      playbackRate: 1,
      subtitleTrack: 'Dansk (SRT)',
    })).resolves.toEqual({ accepted: true, leaseSeconds: 90 });
    expect(prisma.playbackSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'session-1' }),
      data: expect.objectContaining({
        runtimeState: 'playing',
        positionMs: 12_000,
        currentBitrate: 6_000_000,
        currentHeight: 1080,
        stallCount: 2,
        playbackRate: 1,
        subtitleTrack: 'Dansk (SRT)',
        lastStateChangedAt: expect.any(Date),
      }),
    }));
  });

  it('rejects token heartbeats for sessions that were not handed to Cast', async () => {
    const token = 'local-stream-token';
    const service = Object.assign(Object.create(StreamReservationService.prototype), {
      prisma: {
        playbackSession: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'session-2',
            status: 'active',
            runtimeState: 'starting',
            isCastSession: false,
            streamTokenHash: createHash('sha256').update(token).digest('hex'),
          }),
        },
      },
      leaseSeconds: 90,
    }) as StreamReservationService;

    await expect(service.heartbeatWithToken('session-2', token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'cast_session_required' }),
    });
  });
});
