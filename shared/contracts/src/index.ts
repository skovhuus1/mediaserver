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
