import { describe, expect, it } from 'vitest';
import type { EffectiveEntitlements } from '@boltbytes/contracts';
import { choosePlaybackMethod, shouldTranscodeCompatibleSource } from './playback-decision';

const entitlements: EffectiveEntitlements = {
  maxConcurrentStreams: 1,
  maxRegisteredDevices: 5,
  maxVideoResolution: 2160,
  maxVideoBitrate: 50_000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: true,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: false,
  allowChromecast: true,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
};

describe('playback decision quality and HDR gates', () => {
  const base = {
    codec: 'hevc',
    container: 'mp4',
    height: 2160,
    bitrate: 40_000_000,
    hdr: 'hdr10',
    supportsHdr: true,
    supportedCodecs: ['hevc'],
    supportedContainers: ['mp4'],
    entitlements,
  };

  it('allows 4K HDR Direct Play when plan and device both support it', () => {
    expect(choosePlaybackMethod(base).method).toBe('direct_play');
  });

  it('requires transcoding for an SDR-only client or a 1080p plan', () => {
    expect(choosePlaybackMethod({ ...base, supportsHdr: false }).method).toBe('transcode');
    expect(choosePlaybackMethod({
      ...base,
      entitlements: { ...entitlements, maxVideoResolution: 1080 },
    }).method).toBe('transcode');
  });

  it('remuxes compatible video and transcodes only unsupported audio', () => {
    expect(choosePlaybackMethod({
      ...base,
      container: 'matroska',
      audioCodec: 'dts',
      supportedAudioCodecs: ['aac'],
    })).toMatchObject({
      allowed: true,
      method: 'direct_stream',
      directPlayBlockers: ['audio_codec_unsupported', 'container_unsupported'],
    });
  });
});

describe('compatible source Direct Play policy', () => {
  const input = {
    qualityMode: 'auto' as const,
    sourceHeight: 1080,
    sourceBitrate: 12_000_000,
    targetHeight: 1080,
    estimatedDownlinkMbps: 10,
    dataSaver: false,
    preferDirectPlay: true,
  };

  it('does not force a compatible source through HLS from the browser estimate alone', () => {
    expect(shouldTranscodeCompatibleSource(input)).toMatchObject({
      required: false,
      code: 'direct_play_preferred',
    });
  });

  it('can explicitly opt into bandwidth-triggered adaptive transcoding', () => {
    expect(shouldTranscodeCompatibleSource({ ...input, autoTranscodeOnBandwidth: true })).toMatchObject({
      required: true,
      code: 'bandwidth_limited',
    });
  });
});
