import { describe, expect, it } from 'vitest';

import { analyzePreviousEpisodeRecap, playbackMarkerAnalysisVersion, type FrameFingerprint } from './playback-markers.js';

const sequence = (seed: bigint, length: number) => Array.from({ length }, (_, index) => {
  const mask = (1n << 64n) - 1n;
  let value = (seed + BigInt(index) * 0x9e3779b97f4a7c15n) & mask;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & mask;
  return (value ^ (value >> 31n)).toString(16).padStart(16, '0');
});

const fingerprint = (hashes: string[], offsetSeconds = 0): FrameFingerprint => ({
  version: 5,
  intervalSeconds: 2,
  offsetSeconds,
  hashes,
  quality: hashes.map(() => 0.9),
});

const intro = { kind: 'intro' as const, startMs: 40_000, endMs: 90_000, source: 'automatic' as const, confidence: 0.94 };

describe('playback marker analysis v7', () => {
  it('publishes analysis version 7', () => {
    expect(playbackMarkerAnalysisVersion).toBe(7);
  });

  it('detects a coherent recap copied from the previous episode tail', () => {
    const recap = sequence(0x1234n, 12);
    const opening = fingerprint([...recap, ...sequence(0x9999n, 20)]);
    const previousTail = fingerprint([...sequence(0x7777n, 40), ...recap, ...sequence(0x8888n, 4)], 2_400);
    expect(analyzePreviousEpisodeRecap(opening, [previousTail], intro)).toMatchObject({
      state: 'detected',
      reason: 'previous_episode_match',
      marker: { kind: 'recap', startMs: 0, endMs: 40_000 },
    });
  });

  it('rejects sparse flashback-like matches without a coherent previous-tail sequence', () => {
    const shared = sequence(0x1111n, 5);
    const opening = fingerprint(shared.flatMap((hash, index) => [hash, ...sequence(BigInt(0x2000 + index * 100), 3)]));
    const previousTail = fingerprint(shared.flatMap((hash, index) => [hash, ...sequence(BigInt(0x8000 + index * 100), 3)]), 2_400);
    expect(analyzePreviousEpisodeRecap(opening, [previousTail], intro)).toMatchObject({
      state: 'not-detected',
      reason: 'no_repeated_sequence',
      marker: null,
    });
  });
});
