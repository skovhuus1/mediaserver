export const AppRole = {
  ADMIN: 'ADMINISTRATOR',
  OPERATOR: 'OPERATOR',
  STANDARD: 'STANDARD_USER',
  CHILD: 'CHILD_PROFILE',
} as const;

export const ENTITLEMENT_ACTIONS = ['playback', 'direct_play', 'direct_stream', 'transcode', 'cast', 'offline_download'] as const;

export type EntitlementAction = (typeof ENTITLEMENT_ACTIONS)[number];

export const STREAM_ACTIONS = ['playback', 'direct_play', 'direct_stream', 'transcode'] as const;

export type StreamMethod = (typeof STREAM_ACTIONS)[number];

export type PlaybackSessionState = 'reserving' | 'active' | 'paused' | 'stopping' | 'completed' | 'disconnected' | 'expired' | 'terminated_by_admin' | 'failed' | 'user_stopped';
