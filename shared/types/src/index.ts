export type StreamingAction =
  | 'playback'
  | 'direct_play'
  | 'direct_stream'
  | 'transcode'
  | 'cast'
  | 'offline_download';

export type EntitlementAction = StreamingAction;

export type EntitlementDecision = {
  allowed: boolean;
  reason: string | null;
  reasons: string[];
  action: StreamingAction;
  effectiveEntitlements: {
    maxConcurrentStreams: number;
    maxRegisteredDevices: number;
    maxOfflineDownloads: number;
    maxAudioChannels: number;
    allowDirectPlay: boolean;
    allowDirectStream: boolean;
    allowVideoTranscode: boolean;
    allowAudioTranscode: boolean;
    allowChromecast: boolean;
    allowOfflineDownload: boolean;
    allowSubtitleBurnIn: boolean;
    allowHdr: boolean;
    allowDolbyVision: boolean;
    allowLosslessAudio: boolean;
    maxVideoBitrate: number;
    maxVideoResolution: number | null;
    releaseDelayMonths: number;
    releaseDelayDays: number;
  };
};

export type DeviceCapabilities = {
  deviceId: string;
  type: string;
  platform?: string | null;
  appVersion?: string | null;
  supportsCodec?: string[];
  supportsCodecs?: string[];
  maxBitrate?: number | null;
  maxResolution?: number | null;
};

export type SessionLease = {
  sessionId: string;
  leaseExpiresAt: string;
  heartbeatIntervalSeconds: number;
};
