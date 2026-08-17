export type PlaybackHealth = 'healthy' | 'starting' | 'paused' | 'buffering' | 'degraded' | 'stale';

export type PlaybackHealthInput = {
  runtimeState: string;
  bufferAheadMs: number | null;
  droppedFrames: number;
  totalFrames: number;
  lastHeartbeatAtMs: number;
  nowMs: number;
};

export function playbackFrameDropPercent(droppedFrames: number, totalFrames: number): number | null {
  if (!Number.isFinite(droppedFrames) || !Number.isFinite(totalFrames) || totalFrames <= 0) return null;
  return Math.max(0, Math.min(100, (droppedFrames / totalFrames) * 100));
}

export function classifyPlaybackHealth(input: PlaybackHealthInput): PlaybackHealth {
  if (!Number.isFinite(input.lastHeartbeatAtMs) || input.nowMs - input.lastHeartbeatAtMs > 15_000) return 'stale';
  if (input.runtimeState === 'buffering') return 'buffering';
  if (input.runtimeState === 'paused') return 'paused';
  if (input.runtimeState === 'starting') return 'starting';
  const dropPercent = playbackFrameDropPercent(input.droppedFrames, input.totalFrames);
  if (input.runtimeState === 'playing' && input.bufferAheadMs !== null && input.bufferAheadMs < 3_000) return 'degraded';
  if (input.totalFrames >= 120 && dropPercent !== null && dropPercent >= 3) return 'degraded';
  return 'healthy';
}
