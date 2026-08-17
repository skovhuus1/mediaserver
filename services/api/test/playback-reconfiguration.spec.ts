import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackService } from '../src/playback/playback.service';

describe('playback session reconfiguration', () => {
  it('provides burn-in independently of plan transcode flags and reuses the reservation', async () => {
    const streamToken = 'a'.repeat(48);
    const session = {
      id: 'session-1',
      logicalSessionId: 'logical-1',
      accountId: 'account-1',
      userId: 'user-1',
      profileId: 'profile-1',
      mediaId: 'media-1',
      deviceId: 'device-1',
      streamTokenHash: createHash('sha256').update(streamToken).digest('hex'),
      status: 'active',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      media: {
        width: 1920,
        height: 1080,
        bitrate: 8_000_000,
        file: {
          durationMs: 3_600_000,
          probe: {
            streams: [
              {
                index: 4,
                codec_type: 'subtitle',
                codec_name: 'hdmv_pgs_subtitle',
                tags: { language: 'dan' },
              },
            ],
          },
        },
      },
      device: {
        qualityMode: 'auto',
        fixedQualityHeight: null,
        allowUpscale: true,
        dataSaver: false,
        hdrMode: 'auto',
      },
    };
    const prisma = {
      playbackSession: {
        findFirst: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue(session),
      },
      systemJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const entitlements = {
      evaluate: vi.fn().mockResolvedValue({
        allowed: true,
        code: 'allowed',
        reasons: [],
        effective: {
          maxVideoResolution: 2160,
          maxVideoBitrate: 20_000,
          allowVideoTranscode: false,
          allowSubtitleBurnIn: false,
        },
      }),
    };
    const transcodeStream = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    const service = Object.assign(Object.create(PlaybackService.prototype), {
      prisma,
      entitlements,
      transcodeStream,
    }) as PlaybackService;

    const result = await service.reconfigure(
      {
        sub: 'user-1',
        accountId: 'account-1',
        profileId: 'profile-1',
        deviceId: 'device-1',
        roles: [],
      },
      'session-1',
      {
        streamToken,
        burnIn: true,
        subtitleTrackId: 'burnin-4',
      },
    );

    expect(result).toMatchObject({
      accepted: true,
      sessionId: 'session-1',
      logicalSessionId: 'logical-1',
      method: 'transcode',
    });
    expect(prisma.playbackSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ method: 'transcode' }),
    });
    expect(transcodeStream.enqueue).toHaveBeenCalledWith(
      'session-1',
      'account-1',
      expect.objectContaining({ subtitleTrackId: 'burnin-4', startPositionMs: 0 }),
    );
  });

  it('uses synchronized transcoding and clamps an on-demand Direct Stream seek', async () => {
    const streamToken = 'b'.repeat(48);
    const session = {
      id: 'session-2',
      logicalSessionId: 'logical-2',
      accountId: 'account-1',
      userId: 'user-1',
      profileId: 'profile-1',
      mediaId: 'media-1',
      deviceId: 'device-1',
      method: 'direct_stream',
      streamTokenHash: createHash('sha256').update(streamToken).digest('hex'),
      status: 'active',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      media: {
        width: 1920,
        height: 1080,
        bitrate: 8_000_000,
        file: { durationMs: 3_600_000, probe: { streams: [] } },
      },
      device: {
        qualityMode: 'auto',
        fixedQualityHeight: null,
        allowUpscale: true,
        dataSaver: false,
        hdrMode: 'auto',
      },
    };
    const prisma = {
      playbackSession: {
        findFirst: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue(session),
      },
      systemJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-2' }) },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const transcodeStream = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const service = Object.assign(Object.create(PlaybackService.prototype), {
      prisma,
      entitlements: {
        evaluate: vi.fn().mockResolvedValue({
          allowed: true,
          code: 'allowed',
          reasons: [],
          effective: {
            allowVideoTranscode: true,
            maxVideoResolution: 2160,
            maxVideoBitrate: 20_000,
          },
        }),
      },
      transcodeStream,
    }) as PlaybackService;

    const result = await service.reconfigure({
      sub: 'user-1', accountId: 'account-1', profileId: 'profile-1', deviceId: 'device-1', roles: [],
    }, 'session-2', {
      streamToken,
      burnIn: false,
      forceTranscode: true,
      startPositionMs: 4_000_000,
    });

    expect(result.method).toBe('transcode');
    expect(prisma.playbackSession.update).toHaveBeenCalledWith({
      where: { id: 'session-2' },
      data: expect.objectContaining({ method: 'transcode' }),
    });
    expect(transcodeStream.enqueue).toHaveBeenCalledWith(
      'session-2',
      'account-1',
      expect.objectContaining({
        streamMode: 'transcode',
        startPositionMs: 3_599_000,
      }),
    );
  });

  it('rejects a forced runtime fallback when video transcoding is not entitled', async () => {
    const streamToken = 'c'.repeat(48);
    const session = {
      id: 'session-3', logicalSessionId: 'logical-3', accountId: 'account-1', userId: 'user-1',
      profileId: 'profile-1', mediaId: 'media-1', deviceId: 'device-1', method: 'direct_stream',
      streamTokenHash: createHash('sha256').update(streamToken).digest('hex'), status: 'active',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      media: { width: 1920, height: 1080, bitrate: 8_000_000, file: { durationMs: 3_600_000, probe: { streams: [] } } },
      device: { qualityMode: 'auto', fixedQualityHeight: null, allowUpscale: true, dataSaver: false, hdrMode: 'auto' },
    };
    const transcodeStream = { enqueue: vi.fn() };
    const service = Object.assign(Object.create(PlaybackService.prototype), {
      prisma: { playbackSession: { findFirst: vi.fn().mockResolvedValue(session) } },
      entitlements: { evaluate: vi.fn().mockResolvedValue({
        allowed: true,
        code: 'allowed',
        reasons: [],
        effective: { allowVideoTranscode: false, maxVideoResolution: 1080, maxVideoBitrate: 10_000 },
      }) },
      transcodeStream,
    }) as PlaybackService;

    await expect(service.reconfigure({
      sub: 'user-1', accountId: 'account-1', profileId: 'profile-1', deviceId: 'device-1', roles: [],
    }, 'session-3', {
      streamToken,
      burnIn: false,
      forceTranscode: true,
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'video_transcode_not_allowed' }),
    });
    expect(transcodeStream.enqueue).not.toHaveBeenCalled();
  });
});
