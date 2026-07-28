import { z } from 'zod';
export * from './media-classification.js';

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
