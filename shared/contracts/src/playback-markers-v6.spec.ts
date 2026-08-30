import { describe, expect, it } from 'vitest';

import {
  analyzeRepeatedIntro,
  playbackMarkerAnalysisVersion,
  type FrameFingerprint,
} from './playback-markers.js';

const fingerprint = (hashes: string[]): FrameFingerprint => ({
  version: 4,
  intervalSeconds: 2,
  offsetSeconds: 0,
  hashes,
  quality: hashes.map(() => 0.9),
});

const sequence = (seed: bigint, length: number) => Array.from(
  { length },
  (_, index) => (seed + BigInt(index * 104_729)).toString(16).padStart(16, '0'),
);

describe('playback marker analysis v6', () => {
  it('publishes the new analysis version so stale assets are reprocessed', () => {
    expect(playbackMarkerAnalysisVersion).toBe(6);
  });

  it('detects a repeated intro despite a dropped or duplicated source frame', () => {
    const intro = sequence(0x1234567890abcdn, 18);
    const primary = fingerprint([...sequence(0x1000n, 5), ...intro, ...sequence(0x2000n, 6)]);
    const first = fingerprint([...sequence(0x3000n, 9), ...intro.slice(0, 7), 'fedcba9876543210', ...intro.slice(7)]);
    const second = fingerprint([...sequence(0x4000n, 2), ...intro.slice(0, 12), ...intro.slice(13), ...sequence(0x5000n, 4)]);

    expect(analyzeRepeatedIntro(primary, [first, second], {
      minimumSeconds: 24,
      minimumReferences: 2,
      minimumConfidence: 0.82,
    })).toMatchObject({
      state: 'detected',
      supportCount: 2,
      marker: { kind: 'intro', startMs: 10_000, source: 'automatic' },
    });
  });

  it('rejects sparse coincidental frame matches without a sustained sequence', () => {
    const shared = sequence(0x9000n, 6);
    const primary = fingerprint(shared.flatMap((hash, index) => [hash, ...sequence(BigInt(0x10000 + index * 100), 2)]));
    const candidate = fingerprint(shared.flatMap((hash, index) => [hash, ...sequence(BigInt(0x20000 + index * 100), 2)]));
    const result = analyzeRepeatedIntro(primary, [candidate, candidate], {
      minimumSeconds: 12,
      minimumReferences: 2,
      minimumConfidence: 0.82,
    });
    expect(result).toMatchObject({ state: 'not-detected', reason: 'no_repeated_sequence', marker: null });
  });
});
