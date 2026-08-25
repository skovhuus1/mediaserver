import type { EffectiveEntitlements, PlaybackMethod } from '@boltbytes/contracts';

export type DirectPlayBlocker =
  | 'video_codec_unsupported'
  | 'audio_codec_unsupported'
  | 'container_unsupported'
  | 'resolution_exceeds_plan'
  | 'bitrate_exceeds_plan'
  | 'hdr_unsupported'
  | 'direct_play_disabled';

export type PlaybackDecision =
  | { allowed: true; method: PlaybackMethod; code: 'playback_method_selected'; reason: string; directPlayBlockers: DirectPlayBlocker[] }
  | { allowed: false; method: null; code: string; reason: string; directPlayBlockers: DirectPlayBlocker[] };

export function choosePlaybackMethod(input: {
  codec: string | null;
  container: string | null;
  height: number | null;
  bitrate: number | null;
  hdr: string | null;
  supportsHdr: boolean;
  supportedCodecs: readonly string[];
  audioCodec?: string | null;
  supportedAudioCodecs?: readonly string[] | undefined;
  supportedContainers: readonly string[];
  entitlements: EffectiveEntitlements;
}): PlaybackDecision {
  const { codec, container, height, bitrate, hdr, supportsHdr, supportedCodecs, supportedContainers, entitlements } = input;
  if (!codec || !container) {
    return { allowed: false, method: null, code: 'media_profile_missing', reason: 'Media codec and container analysis is required before playback', directPlayBlockers: [] };
  }
  const codecSupported = intersects(codecTokens(codec), supportedCodecs.flatMap(codecTokens));
  const containerSupported = intersects(containerTokens(container), supportedContainers.flatMap(containerTokens));
  const audioCodecSupported = !input.audioCodec
    || input.supportedAudioCodecs === undefined
    || intersects(codecTokens(input.audioCodec), input.supportedAudioCodecs.flatMap(codecTokens));
  const resolutionAllowed = height === null || height <= entitlements.maxVideoResolution;
  const bitrateAllowed = bitrate === null || bitrate <= entitlements.maxVideoBitrate * 1_000;
  const dynamicRangeSupported = hdr === null || supportsHdr;
  const directPlayBlockers: DirectPlayBlocker[] = [
    ...(!codecSupported ? ['video_codec_unsupported' as const] : []),
    ...(!audioCodecSupported ? ['audio_codec_unsupported' as const] : []),
    ...(!containerSupported ? ['container_unsupported' as const] : []),
    ...(!resolutionAllowed ? ['resolution_exceeds_plan' as const] : []),
    ...(!bitrateAllowed ? ['bitrate_exceeds_plan' as const] : []),
    ...(!dynamicRangeSupported ? ['hdr_unsupported' as const] : []),
    ...(!entitlements.allowDirectPlay ? ['direct_play_disabled' as const] : []),
  ];

  if (directPlayBlockers.length === 0) {
    return {
      allowed: true,
      method: 'direct_play',
      code: 'playback_method_selected',
      reason: 'Device and plan support the source codec, container, quality and dynamic range',
      directPlayBlockers,
    };
  }
  const directStreamCompatible = directPlayBlockers.every((blocker) =>
    blocker === 'audio_codec_unsupported'
    || blocker === 'container_unsupported'
    || blocker === 'direct_play_disabled',
  );
  const audioTranscodeRequired = directPlayBlockers.includes('audio_codec_unsupported');
  if (
    directStreamCompatible
    && entitlements.allowDirectStream
    && (!audioTranscodeRequired || entitlements.allowAudioTranscode)
  ) {
    return {
      allowed: true,
      method: 'direct_stream',
      code: 'playback_method_selected',
      reason: audioTranscodeRequired
        ? 'Source video is compatible and will be copied while the unsupported audio track is transcoded to AAC'
        : 'Source video and audio are compatible and will be remuxed without video re-encoding',
      directPlayBlockers,
    };
  }
  if (entitlements.allowVideoTranscode && (!audioTranscodeRequired || entitlements.allowAudioTranscode)) {
    return {
      allowed: true,
      method: 'transcode',
      code: 'playback_method_selected',
      reason: `Direct Play is unavailable: ${directPlayBlockers.join(', ')}`,
      directPlayBlockers,
    };
  }
  const reason = audioTranscodeRequired && !entitlements.allowAudioTranscode
    ? `This device requires audio transcoding (${directPlayBlockers.join(', ')}), but the active plan does not allow it`
    : directStreamCompatible && !entitlements.allowDirectStream
      ? `This device requires Direct Stream (${directPlayBlockers.join(', ')}), but the active plan does not allow it`
      : `This device requires video transcoding (${directPlayBlockers.join(', ')}), but the active plan does not allow it`;
  return {
    allowed: false,
    method: null,
    code: 'transcode_required_but_forbidden',
    reason,
    directPlayBlockers,
  };
}

export function shouldTranscodeCompatibleSource(input: {
  qualityMode: 'auto' | 'fixed' | 'original';
  sourceHeight: number | null;
  sourceBitrate: number | null;
  targetHeight: number;
  estimatedDownlinkMbps: number | null;
  dataSaver: boolean;
  preferDirectPlay: boolean;
  allowUpscale?: boolean;
  upscaleMode?: 'off' | 'server' | 'device' | null;
  autoTranscodeOnBandwidth?: boolean;
}): { required: boolean; code: string; reason: string } {
  if (input.qualityMode === 'original') {
    return { required: false, code: 'original_requested', reason: 'Original quality explicitly prefers Direct Play' };
  }
  if (
    input.allowUpscale === true
    && input.upscaleMode === 'server'
    && input.sourceHeight !== null
    && input.targetHeight > input.sourceHeight
  ) {
    return { required: true, code: 'server_upscale', reason: 'Server upscaling requires a managed adaptive stream' };
  }
  if (
    input.dataSaver
    && ((input.sourceHeight ?? 0) > 720 || (input.sourceBitrate ?? 0) > 3_000_000)
  ) {
    return { required: true, code: 'data_saver', reason: 'Data saver requires a 720p/3 Mbps managed stream' };
  }
  if (
    input.qualityMode === 'fixed'
    && input.sourceHeight !== null
    && input.sourceHeight !== input.targetHeight
  ) {
    return { required: true, code: 'fixed_quality', reason: `Fixed ${input.targetHeight}p output differs from the source` };
  }
  const bandwidthBudget = input.estimatedDownlinkMbps && input.estimatedDownlinkMbps > 0
    ? input.estimatedDownlinkMbps * 1_000_000 * 0.75
    : null;
  if (
    input.autoTranscodeOnBandwidth
    && input.qualityMode === 'auto'
    && bandwidthBudget !== null
    && input.sourceBitrate !== null
    && input.sourceBitrate > bandwidthBudget
  ) {
    return { required: true, code: 'bandwidth_limited', reason: 'Estimated network bandwidth is below the source bitrate safety margin' };
  }
  if (!input.preferDirectPlay) {
    return { required: true, code: 'managed_stream_preferred', reason: 'Server policy prefers a managed adaptive stream' };
  }
  return { required: false, code: 'direct_play_preferred', reason: 'Compatible source can play directly without consuming transcode capacity' };
}

function codecTokens(value: string): string[] {
  return value.split(',').map((entry) => normalizeCodec(entry)).filter(Boolean);
}

function containerTokens(value: string): string[] {
  return value.split(',').map((entry) => normalizeContainer(entry)).filter(Boolean);
}

function normalizeCodec(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ({
    avc: 'h264',
    avc1: 'h264',
    x264: 'h264',
    h265: 'hevc',
    hev1: 'hevc',
    hvc1: 'hevc',
    x265: 'hevc',
    vp09: 'vp9',
    av01: 'av1',
    mp4a: 'aac',
    'ac-3': 'ac3',
    'e-ac-3': 'eac3',
    dca: 'dts',
  } as Record<string, string>)[normalized] ?? normalized;
}

function normalizeContainer(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ({ mkv: 'matroska', quicktime: 'mov', m4v: 'mov' } as Record<string, string>)[normalized] ?? normalized;
}

function intersects(source: readonly string[], supported: readonly string[]): boolean {
  const supportedSet = new Set(supported);
  return source.some((value) => supportedSet.has(value));
}
