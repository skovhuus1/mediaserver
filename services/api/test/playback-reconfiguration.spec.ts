import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackService } from '../src/playback/playback.service';

describe('playback session reconfiguration', () => {
  const hlsGeneration = '22222222-2222-4222-8222-222222222222';
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
      enqueue: vi.fn().mockResolvedValue(hlsGeneration),
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

    expect(prisma.systemJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        NOT: { payload: { path: ['streamMode'], equals: 'subtitle_only' } },
      }),
    }));

    expect(result).toMatchObject({
      accepted: true,
      sessionId: 'session-1',
      logicalSessionId: 'logical-1',
      method: 'transcode',
      streamUrl: `/api/v1/playback/sessions/session-1/hls/master.m3u8?token=${streamToken}&generation=${hlsGeneration}`,
      transcodeStatusUrl: `/api/v1/playback/sessions/session-1/transcode-status?token=${streamToken}&generation=${hlsGeneration}`,
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
    const transcodeStream = { enqueue: vi.fn().mockResolvedValue(hlsGeneration) };
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

  it('uses requested fixed quality instead of stale device quality during reconfigure', async () => {
    const streamToken = 'd'.repeat(48);
    const session = {
      id: 'session-4',
      logicalSessionId: 'logical-4',
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
        width: 3840,
        height: 2160,
        bitrate: 18_000_000,
        file: {
          durationMs: 3_600_000,
          probe: { streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc' }] },
        },
      },
      device: {
        type: 'android_tv',
        qualityMode: 'original',
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
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-4' }) },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const transcodeStream = { enqueue: vi.fn().mockResolvedValue(hlsGeneration) };
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
    }, 'session-4', {
      streamToken,
      burnIn: false,
      forceTranscode: true,
      qualityMode: 'fixed',
      fixedQualityHeight: 720,
    });

    expect(result.adaptiveQuality).toMatchObject({ effectiveMaxHeight: 720 });
    expect(transcodeStream.enqueue).toHaveBeenCalledWith(
      'session-4',
      'account-1',
      expect.objectContaining({
        adaptiveQuality: expect.objectContaining({ effectiveMaxHeight: 720 }),
      }),
    );
  });

  it('passes selected audio stream index to the transcode job', async () => {
    const streamToken = 'e'.repeat(48);
    const session = {
      id: 'session-5',
      logicalSessionId: 'logical-5',
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
        file: {
          durationMs: 3_600_000,
          probe: {
            streams: [
              { index: 0, codec_type: 'video', codec_name: 'h264' },
              {
                index: 1,
                codec_type: 'audio',
                codec_name: 'aac',
                channels: 2,
                tags: { language: 'dan', title: 'Dansk' },
                disposition: { default: 1 },
              },
              {
                index: 2,
                codec_type: 'audio',
                codec_name: 'dts',
                channels: 6,
                tags: { language: 'eng', title: 'English 5.1' },
                disposition: { default: 0 },
              },
            ],
          },
        },
      },
      device: {
        type: 'android_tv',
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
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-5' }) },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const transcodeStream = { enqueue: vi.fn().mockResolvedValue(hlsGeneration) };
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
    }, 'session-5', {
      streamToken,
      burnIn: false,
      forceTranscode: true,
      audioTrackId: 'audio-2',
    });

    expect(result.selectedAudioTrackId).toBe('audio-2');
    expect(result.audioTracks.find((track) => track.id === 'audio-2')?.selected).toBe(true);
    expect(transcodeStream.enqueue).toHaveBeenCalledWith(
      'session-5',
      'account-1',
      expect.objectContaining({
        audioTrackId: 'audio-2',
        audioStreamIndex: 2,
      }),
    );
  });

  it('rejects unknown audio tracks before queueing transcode work', async () => {
    const streamToken = 'f'.repeat(48);
    const session = {
      id: 'session-6',
      logicalSessionId: 'logical-6',
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
        file: {
          durationMs: 3_600_000,
          probe: {
            streams: [
              { index: 0, codec_type: 'video', codec_name: 'h264' },
              { index: 1, codec_type: 'audio', codec_name: 'aac' },
            ],
          },
        },
      },
      device: {
        type: 'android_tv',
        qualityMode: 'auto',
        fixedQualityHeight: null,
        allowUpscale: true,
        dataSaver: false,
        hdrMode: 'auto',
      },
    };
    const transcodeStream = { enqueue: vi.fn() };
    const service = Object.assign(Object.create(PlaybackService.prototype), {
      prisma: { playbackSession: { findFirst: vi.fn().mockResolvedValue(session) } },
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

    await expect(service.reconfigure({
      sub: 'user-1', accountId: 'account-1', profileId: 'profile-1', deviceId: 'device-1', roles: [],
    }, 'session-6', {
      streamToken,
      burnIn: false,
      forceTranscode: true,
      audioTrackId: 'audio-99',
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'audio_track_invalid' }),
    });
    expect(transcodeStream.enqueue).not.toHaveBeenCalled();
  });
});
