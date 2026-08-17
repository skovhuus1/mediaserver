import { choosePlaybackMethod, shouldTranscodeCompatibleSource } from '../src/playback/playback-decision';
import type { EffectiveEntitlements } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

const entitlements: EffectiveEntitlements = {
  maxConcurrentStreams: 1,
  maxRegisteredDevices: 2,
  maxVideoResolution: 1080,
  maxVideoBitrate: 8000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: false,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: false,
  allowChromecast: false,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
};

describe('playback decision', () => {
  const sdr1080Profile = {
    height: 1080,
    bitrate: 8_000_000,
    hdr: null,
    supportsHdr: false,
  };

  it('chooses direct play only when codec and container are supported', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'h264',
      container: 'mp4',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: true, method: 'direct_play' });
  });

  it('does not silently select transcode when the plan forbids it', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'av1',
      container: 'mkv',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: false, code: 'transcode_required_but_forbidden' });
  });

  it('selects transcode for a browser-incompatible codec when the plan permits it', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'hevc',
      container: 'matroska',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements: { ...entitlements, allowVideoTranscode: true },
    })).toMatchObject({ allowed: true, method: 'transcode' });
  });

  it('does not claim direct-stream support before a remux pipeline exists', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'h264',
      container: 'matroska',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: false, code: 'transcode_required_but_forbidden' });
  });

  it('normalizes FFprobe codec and container aliases before selecting Direct Play', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'avc1',
      audioCodec: 'mp4a',
      container: 'mov,mp4,m4a,3gp,3g2,mj2',
      supportedCodecs: ['h264'],
      supportedAudioCodecs: ['aac'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: true, method: 'direct_play', directPlayBlockers: [] });
  });

  it('reports an unsupported audio codec instead of falsely promising Direct Play', () => {
    expect(choosePlaybackMethod({
      ...sdr1080Profile,
      codec: 'h264',
      audioCodec: 'dts',
      container: 'mp4',
      supportedCodecs: ['h264'],
      supportedAudioCodecs: ['aac'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({
      allowed: false,
      code: 'transcode_required_but_forbidden',
      directPlayBlockers: ['audio_codec_unsupported'],
    });
  });

  it('does not force Auto transcoding from a browser bandwidth estimate unless enabled', () => {
    const policy = {
      qualityMode: 'auto' as const,
      sourceHeight: 1080,
      sourceBitrate: 8_000_000,
      targetHeight: 1080,
      dataSaver: false,
      preferDirectPlay: true,
    };
    expect(shouldTranscodeCompatibleSource({ ...policy, estimatedDownlinkMbps: 50 }).required).toBe(false);
    expect(shouldTranscodeCompatibleSource({ ...policy, estimatedDownlinkMbps: 8 }).required).toBe(false);
    expect(shouldTranscodeCompatibleSource({
      ...policy,
      estimatedDownlinkMbps: 8,
      autoTranscodeOnBandwidth: true,
    })).toMatchObject({
      required: true,
      code: 'bandwidth_limited',
    });
  });

  it('honors data saver and fixed quality while original always stays direct', () => {
    const basePolicy = {
      sourceHeight: 1080,
      sourceBitrate: 8_000_000,
      targetHeight: 720,
      estimatedDownlinkMbps: null,
      preferDirectPlay: true,
    };
    expect(shouldTranscodeCompatibleSource({ ...basePolicy, qualityMode: 'auto', dataSaver: true }).code).toBe('data_saver');
    expect(shouldTranscodeCompatibleSource({ ...basePolicy, qualityMode: 'fixed', dataSaver: false }).code).toBe('fixed_quality');
    expect(shouldTranscodeCompatibleSource({ ...basePolicy, qualityMode: 'original', dataSaver: true }).required).toBe(false);
  });
});
