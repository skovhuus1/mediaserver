import { classifyPlaybackHealth, playbackFrameDropPercent } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('playback QoE classification', () => {
  const nowMs = Date.parse('2026-08-17T19:30:00.000Z');

  it('classifies stable, buffering, degraded and stale playback deterministically', () => {
    const base = {
      runtimeState: 'playing',
      bufferAheadMs: 30_000,
      droppedFrames: 1,
      totalFrames: 1_000,
      lastHeartbeatAtMs: nowMs - 2_000,
      nowMs,
    };
    expect(classifyPlaybackHealth(base)).toBe('healthy');
    expect(classifyPlaybackHealth({ ...base, runtimeState: 'buffering' })).toBe('buffering');
    expect(classifyPlaybackHealth({ ...base, bufferAheadMs: 1_500 })).toBe('degraded');
    expect(classifyPlaybackHealth({ ...base, droppedFrames: 40 })).toBe('degraded');
    expect(classifyPlaybackHealth({ ...base, lastHeartbeatAtMs: nowMs - 16_000 })).toBe('stale');
  });

  it('reports frame loss only when decoded frame telemetry exists', () => {
    expect(playbackFrameDropPercent(3, 120)).toBe(2.5);
    expect(playbackFrameDropPercent(0, 0)).toBeNull();
  });
});
