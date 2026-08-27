import { z } from 'zod';
export * from './media-classification.js';
export * from './media-metadata.js';
export * from './hdr-profile.js';
export * from './adaptive-quality.js';
export * from './cpu-transcode-profile.js';
export * from './playback-resume.js';
export * from './playback-quality.js';
export * from './playback-runtime.js';
export * from './playback-qoe.js';
export * from './playback-markers.js';
export * from './series-identity.js';
export * from './direct-stream-remux.js';
export * from './series-continuity.js';
export * from './transcode-timeline.js';
export * from './live-tv-channel.js';
export * from './live-tv-danish-channel-order.js';
export * from './tv-login.js';
export * from './release.js';

export type HlsRendition = {
  height: number;
  bitrate: number;
};

export function sortHlsRenditions<T extends HlsRendition>(renditions: readonly T[]): T[] {
  return [...renditions].sort(
    (left, right) => left.height - right.height || left.bitrate - right.bitrate,
  );
}

export function selectHlsRenditionsForCapacity<T extends HlsRendition>(
  renditions: readonly T[],
  capacity: { maxHeight: number; maxRenditions: number },
): T[] {
  const sorted = sortHlsRenditions(renditions);
  if (sorted.length === 0) return [];
  const maximumHeight = Number.isFinite(capacity.maxHeight)
    ? Math.max(1, Math.trunc(capacity.maxHeight))
    : sorted[0]!.height;
  const withinHeight = sorted.filter((rendition) => rendition.height <= maximumHeight);
  const eligible = withinHeight.length > 0 ? withinHeight : [sorted[0]!];
  const maximumRenditions = Number.isFinite(capacity.maxRenditions)
    ? Math.max(1, Math.trunc(capacity.maxRenditions))
    : 1;
  if (eligible.length <= maximumRenditions) return eligible;
  if (maximumRenditions === 1) return [eligible[0]!];
  const indexes = new Set<number>();
  for (let slot = 0; slot < maximumRenditions; slot += 1) {
    indexes.add(Math.round((slot * (eligible.length - 1)) / (maximumRenditions - 1)));
  }
  return [...indexes].sort((left, right) => left - right).map((index) => eligible[index]!);
}

export const entitlementActionSchema = z.enum(['playback', 'cast', 'offline_download']);
export type EntitlementAction = z.infer<typeof entitlementActionSchema>;

export const playbackMethodSchema = z.enum(['direct_play', 'direct_stream', 'transcode']);
export type PlaybackMethod = z.infer<typeof playbackMethodSchema>;

export type EffectiveEntitlements = {
  maxConcurrentStreams: number;
  maxRegisteredDevices: number;
  maxVideoResolution: number;
  maxVideoBitrate: number;
  allowDirectPlay: boolean;
  allowDirectStream: boolean;
  allowVideoTranscode: boolean;
  allowAudioTranscode: boolean;
  allowSubtitleBurnIn: boolean;
  allowChromecast: boolean;
  allowOfflineDownload: boolean;
  releaseDelayMonths: number;
  releaseDelayDays: number;
};

export type EntitlementDecision = {
  allowed: boolean;
  code: string;
  reasons: string[];
  availableAt: string | null;
  effective: EffectiveEntitlements;
};

export type AuthenticatedUser = {
  sub: string;
  accountId: string;
  profileId: string | null;
  deviceId: string | null;
  roles: string[];
};

export type ApiError = {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
};

export * from './metadata-overrides.js';
