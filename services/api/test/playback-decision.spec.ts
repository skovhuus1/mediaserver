import { choosePlaybackMethod } from '../src/playback/playback-decision';
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
  it('chooses direct play only when codec and container are supported', () => {
    expect(choosePlaybackMethod({
      codec: 'h264',
      container: 'mp4',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: true, method: 'direct_play' });
  });

  it('does not silently select transcode when the plan forbids it', () => {
    expect(choosePlaybackMethod({
      codec: 'av1',
      container: 'mkv',
      supportedCodecs: ['h264'],
      supportedContainers: ['mp4'],
      entitlements,
    })).toMatchObject({ allowed: false, code: 'transcode_required_but_forbidden' });
  });
});
