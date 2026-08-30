import { describe, expect, it } from 'vitest';

import {
  analyzePreviousEpisodeRecap,
  analyzeRepeatedIntro,
  creditsMarkerFromTailEvidence,
  type FrameFingerprint,
} from './playback-markers.js';

const fingerprint = (hashes: string[], intervalSeconds = 2): FrameFingerprint => ({
  version: 4,
  intervalSeconds,
  offsetSeconds: 0,
  hashes,
  quality: hashes.map(() => 1),
});

describe('playback marker analysis v5', () => {
  it('accepts one high-confidence opening reference and two-reference consensus at the configured thresholds', () => {
    const opening = fingerprint(Array.from({ length: 12 }, (_, index) => (0x1234567890abcdefn + BigInt(index * 17)).toString(16).padStart(16, '0')));
    const reference = fingerprint([...opening.hashes]);
    expect(analyzeRepeatedIntro(opening, [reference], {
      minimumSeconds: 12, minimumReferences: 1, minimumConfidence: 0.9,
    }).marker).toMatchObject({ kind: 'intro' });
    expect(analyzeRepeatedIntro(opening, [reference, reference], {
      minimumSeconds: 12, minimumReferences: 2, minimumConfidence: 0.8,
    }).marker).toMatchObject({ kind: 'intro' });
  });

  it('detects recap only when the opening reuses previous episode frames before a proven intro', () => {
    const opening = fingerprint(['0000000000000001', '0000000000000002', '0000000000000003', '0000000000000004', '0000000000000005', '0000000000000006', '0000000000000007', '0000000000000008', '0000000000000009', '000000000000000a']);
    const previous = fingerprint([
      'fffffffffffffff1',
      '0000000000000001',
      '0000000000000002',
      '0000000000000003',
      '0000000000000004',
      '0000000000000005',
      '0000000000000006',
    ]);
    const result = analyzePreviousEpisodeRecap(opening, [previous], {
      kind: 'intro', startMs: 20_000, endMs: 40_000, source: 'automatic', confidence: 0.95,
    });
    expect(result.reason).toBe('previous_episode_match');
    expect(result.marker).toMatchObject({ kind: 'recap', startMs: 0, endMs: 20_000 });
  });

  it('does not classify a novel cold open as recap', () => {
    const result = analyzePreviousEpisodeRecap(
      fingerprint(Array.from({ length: 10 }, (_, index) => index % 2 ? 'aaaaaaaaaaaaaaaa' : 'cccccccccccccccc')),
      [fingerprint(['5555555555555555', '3333333333333333', 'ffffffffffffffff'], 5)],
      { kind: 'intro', startMs: 20_000, endMs: 40_000, source: 'automatic', confidence: 0.95 },
    );
    expect(result.marker).toBeNull();
  });

  it('requires an independently proven intro boundary', () => {
    expect(analyzePreviousEpisodeRecap(fingerprint(['1', '2', '3']), [fingerprint(['1'])], null).reason)
      .toBe('no_intro_boundary');
  });

  it('keeps episode one pending instead of inventing a recap without previous episodes', () => {
    expect(analyzePreviousEpisodeRecap(
      fingerprint(Array.from({ length: 20 }, () => '1234567890abcdef')),
      [],
      { kind: 'intro', startMs: 40_000, endMs: 90_000, source: 'automatic', confidence: 0.95 },
    )).toMatchObject({ state: 'pending', reason: 'insufficient_previous_episodes', marker: null });
  });

  it('detects sustained credit-like tail evidence but ignores an early dark scene', () => {
    const durationMs = 1_000_000;
    const samples = Array.from({ length: 50 }, (_, index) => ({
      atMs: 850_000 + index * 3_000,
      luma: 0.2,
      motion: 0.1,
      edgeDensity: 0.2,
    }));
    expect(creditsMarkerFromTailEvidence(samples, [], durationMs)).toMatchObject({
      kind: 'credits', startMs: 850_000, endMs: durationMs,
    });
    expect(creditsMarkerFromTailEvidence([{ atMs: 500_000, luma: 0.01, motion: 0, edgeDensity: 0.2 }], [], durationMs)).toBeNull();
  });
});
