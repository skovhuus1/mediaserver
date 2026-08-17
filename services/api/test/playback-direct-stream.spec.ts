import type { EffectiveEntitlements } from '@boltbytes/contracts';
import { describe, expect, it, vi } from 'vitest';
import { PlaybackService } from '../src/playback/playback.service';

const effective: EffectiveEntitlements = {
  maxConcurrentStreams: 2,
  maxRegisteredDevices: 5,
  maxVideoResolution: 2160,
  maxVideoBitrate: 50_000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: true,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: true,
  allowChromecast: true,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
};

describe('PlaybackService Direct Stream authorization', () => {
  it.each([
    {
      scenario: 'playback from the beginning',
      startPositionMs: undefined,
      expectedMethod: 'direct_stream' as const,
      expectedStreamMode: 'direct_stream' as const,
    },
    {
      scenario: 'continue playback from saved progress',
      startPositionMs: 62_000,
      expectedMethod: 'transcode' as const,
      expectedStreamMode: 'transcode' as const,
    },
  ])('selects a synchronized delivery method for $scenario', async ({
    startPositionMs,
    expectedMethod,
    expectedStreamMode,
  }) => {
    const prisma = {
      mediaItem: { findFirst: vi.fn().mockResolvedValue({
        id: 'media-1',
        title: 'Remux fixture',
        codec: 'h264',
        container: 'matroska',
        width: 1920,
        height: 1080,
        bitrate: 8_000_000,
        file: {
          status: 'ready',
          audioCodec: 'dts',
          durationMs: 3_600_000,
          probe: { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }] },
          storageRoot: { mountPath: '/media' },
        },
      }) },
      device: { findFirst: vi.fn().mockResolvedValue({
        id: 'device-1',
        qualityMode: 'original',
        fixedQualityHeight: null,
        allowUpscale: true,
        dataSaver: false,
        hdrMode: 'auto',
        playbackRate: 1,
      }) },
      profilePreferences: { findUnique: vi.fn().mockResolvedValue(null) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const reservations = {
      reserve: vi.fn().mockResolvedValue({
        id: 'session-1',
        logicalSessionId: 'logical-1',
        streamToken: 'stream-token',
        leaseExpiresAt: new Date('2026-08-17T12:00:00.000Z'),
      }),
      release: vi.fn(),
    };
    const hlsGeneration = '11111111-1111-4111-8111-111111111111';
    const transcodeStream = { enqueue: vi.fn().mockResolvedValue(hlsGeneration) };
    const subtitleStream = { listForPlayback: vi.fn().mockResolvedValue([]) };
    const service = Object.assign(Object.create(PlaybackService.prototype), {
      prisma,
      entitlements: { evaluate: vi.fn().mockResolvedValue({ allowed: true, code: 'allowed', reasons: [], effective }) },
      reservations,
      transcodeStream,
      subtitleStream,
    }) as PlaybackService;

    const result = await service.authorize({
      sub: 'user-1',
      accountId: 'account-1',
      profileId: 'profile-1',
      deviceId: 'device-1',
      roles: [],
    }, {
      profileId: 'profile-1',
      mediaId: 'media-1',
      deviceId: 'device-1',
      isCastSession: false,
      ...(startPositionMs === undefined ? {} : { startPositionMs }),
      capabilities: {
        supportedCodecs: ['h264'],
        supportedAudioCodecs: ['aac'],
        supportedContainers: ['mp4'],
        supportsHdr: false,
      },
    });

    expect(result).toMatchObject({
      sessionId: 'session-1',
      logicalSessionId: 'logical-1',
      method: expectedMethod,
      contentType: 'application/x-mpegURL',
      streamUrl: `/api/v1/playback/sessions/session-1/hls/master.m3u8?token=stream-token&generation=${hlsGeneration}`,
      transcodeStatusUrl: `/api/v1/playback/sessions/session-1/transcode-status?token=stream-token&generation=${hlsGeneration}`,
      adaptiveQuality: { mode: 'original', renditions: [{ height: 1080, upscaled: false }] },
    });
    expect(reservations.reserve).toHaveBeenCalledOnce();
    expect(transcodeStream.enqueue).toHaveBeenCalledWith('session-1', 'account-1', expect.objectContaining({
      streamMode: expectedStreamMode,
      ...(expectedStreamMode === 'direct_stream' ? { audioMode: 'aac' } : {}),
      startPositionMs: startPositionMs ?? 0,
      adaptiveQuality: expect.objectContaining({ renditions: [expect.objectContaining({ height: 1080 })] }),
    }));
    expect(subtitleStream.listForPlayback).toHaveBeenCalledWith(
      'session-1',
      'stream-token',
      expect.any(Object),
      true,
    );
  });
});
