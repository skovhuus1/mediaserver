import type { EffectiveEntitlements, PlaybackMethod } from '@boltbytes/contracts';

export type PlaybackDecision =
  | { allowed: true; method: PlaybackMethod; code: 'playback_method_selected'; reason: string }
  | { allowed: false; method: null; code: string; reason: string };

export function choosePlaybackMethod(input: {
  codec: string | null;
  container: string | null;
  height: number | null;
  bitrate: number | null;
  hdr: string | null;
  supportsHdr: boolean;
  supportedCodecs: readonly string[];
  supportedContainers: readonly string[];
  entitlements: EffectiveEntitlements;
}): PlaybackDecision {
  const { codec, container, height, bitrate, hdr, supportsHdr, supportedCodecs, supportedContainers, entitlements } = input;
  if (!codec || !container) {
    return { allowed: false, method: null, code: 'media_profile_missing', reason: 'Media codec and container analysis is required before playback' };
  }
  const normalizedCodec = codec.toLowerCase();
  const normalizedContainer = container.toLowerCase();
  const codecSupported = supportedCodecs.map((value) => value.toLowerCase()).includes(normalizedCodec);
  const containerSupported = supportedContainers.map((value) => value.toLowerCase()).includes(normalizedContainer);
  const resolutionAllowed = height === null || height <= entitlements.maxVideoResolution;
  const bitrateAllowed = bitrate === null || bitrate <= entitlements.maxVideoBitrate * 1_000;
  const dynamicRangeSupported = hdr === null || supportsHdr;

  if (
    codecSupported
    && containerSupported
    && resolutionAllowed
    && bitrateAllowed
    && dynamicRangeSupported
    && entitlements.allowDirectPlay
  ) {
    return {
      allowed: true,
      method: 'direct_play',
      code: 'playback_method_selected',
      reason: 'Device and plan support the source codec, container, quality and dynamic range',
    };
  }
  if (entitlements.allowVideoTranscode) {
    return { allowed: true, method: 'transcode', code: 'playback_method_selected', reason: 'A compatible stream must be transcoded' };
  }
  return {
    allowed: false,
    method: null,
    code: 'transcode_required_but_forbidden',
    reason: 'This device requires video transcoding, but the active plan does not allow it',
  };
}
