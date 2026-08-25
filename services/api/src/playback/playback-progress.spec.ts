import { describe, expect, it } from 'vitest';
import { normalizePlaybackProgress } from './playback-progress';

describe('normalizePlaybackProgress', () => {
  it('normalizes negative positions to zero', () => {
    expect(normalizePlaybackProgress(-50, 10_000)).toEqual({
      positionMs: 0,
      durationMs: 10_000,
      completed: false,
    });
  });

  it('clamps a position to the known duration', () => {
    expect(normalizePlaybackProgress(12_000, 10_000).positionMs).toBe(10_000);
  });

  it('does not infer completion or session release from high playback position', () => {
    expect(normalizePlaybackProgress(90_000, 100_000).completed).toBe(false);
    expect(normalizePlaybackProgress(99_999, 100_000).completed).toBe(false);
  });

  it('honors an explicit completion signal without a duration', () => {
    expect(normalizePlaybackProgress(5_000, null, true).completed).toBe(true);
  });

  it('honors an explicit completion signal at a known duration', () => {
    expect(normalizePlaybackProgress(100_000, 100_000, true)).toEqual({
      positionMs: 100_000,
      durationMs: 100_000,
      completed: true,
    });
  });
});
