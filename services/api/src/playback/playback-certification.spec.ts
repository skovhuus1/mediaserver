import type { EffectiveEntitlements } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';
import { choosePlaybackMethod } from './playback-decision';

const entitlements = {
  maxVideoResolution: 2160,
  maxVideoBitrate: 50_000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: true,
  allowAudioTranscode: true,
} as EffectiveEntitlements;

const browser = {
  height: 1080,
  bitrate: 8_000_000,
  hdr: null,
  supportsHdr: false,
  supportedCodecs: ['h264'],
  supportedAudioCodecs: ['aac'],
  supportedContainers: ['mp4'],
  entitlements,
};

describe('certified browser playback matrix', () => {
  it.each([
    ['H.264/AAC MP4', { codec: 'h264', audioCodec: 'aac', container: 'mp4' }, 'direct_play'],
    ['H.264/AAC MKV', { codec: 'h264', audioCodec: 'aac', container: 'matroska' }, 'direct_stream'],
    ['H.264/EAC3 MKV', { codec: 'h264', audioCodec: 'eac3', container: 'matroska' }, 'direct_stream'],
    ['HEVC/AAC MKV', { codec: 'hevc', audioCodec: 'aac', container: 'matroska' }, 'transcode'],
    ['H.264 HDR MP4 on SDR display', { codec: 'h264', audioCodec: 'aac', container: 'mp4', hdr: 'hdr10' }, 'transcode'],
  ])('%s selects %s', (_name, media, expectedMethod) => {
    expect(choosePlaybackMethod({ ...browser, ...media })).toMatchObject({ allowed: true, method: expectedMethod });
  });

  it('returns a concrete entitlement failure when video transcoding is unavailable', () => {
    expect(choosePlaybackMethod({
      ...browser,
      codec: 'hevc',
      audioCodec: 'aac',
      container: 'matroska',
      entitlements: { ...entitlements, allowVideoTranscode: false },
    })).toMatchObject({
      allowed: false,
      code: 'transcode_required_but_forbidden',
      directPlayBlockers: expect.arrayContaining(['video_codec_unsupported']),
    });
  });
});
