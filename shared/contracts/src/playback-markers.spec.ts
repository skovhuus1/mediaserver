import { describe, expect, it } from 'vitest';
import {
  buildTrickplayCues,
  analyzeRepeatedIntro,
  chapterTimelineMarkers,
  creditsMarkerFromBlackSegments,
  detectRepeatedIntro,
  type FrameFingerprint,
} from './playback-markers.js';

describe('playback markers and trickplay', () => {
  it('builds deterministic multi-sheet trickplay coordinates', () => {
    const cues = buildTrickplayCues({ durationMs: 260_000, intervalSeconds: 10, columns: 5, rows: 5 });
    expect(cues).toHaveLength(26);
    expect(cues[24]).toMatchObject({ sheet: 0, column: 4, row: 4 });
    expect(cues[25]).toMatchObject({ sheet: 1, column: 0, row: 0, endMs: 260_000 });
  });

  it('uses explicit chapter names as high-confidence markers', () => {
    expect(chapterTimelineMarkers([
      { title: 'Opening Credits', startMs: 30_000, endMs: 92_000 },
      { title: 'End Credits', startMs: 3_200_000, endMs: 3_400_000 },
    ], 3_400_000)).toEqual([
      expect.objectContaining({ kind: 'intro', source: 'chapter', confidence: 1 }),
      expect.objectContaining({ kind: 'credits', startMs: 3_200_000, endMs: 3_400_000 }),
    ]);
  });

  it('detects a repeated non-static opening sequence across episodes', () => {
    const hashes = Array.from({ length: 30 }, (_, index) => (0x1000n + BigInt(index * 17)).toString(16).padStart(16, '0'));
    const primary: FrameFingerprint = { intervalSeconds: 5, offsetSeconds: 15, hashes: ['ffffffffffffffff', 'aaaaaaaaaaaaaaaa', ...hashes, 'ffffffff00000000'] };
    const candidate: FrameFingerprint = { intervalSeconds: 5, offsetSeconds: 15, hashes: ['0000000000000000', ...hashes, '00000000ffffffff'] };
    expect(detectRepeatedIntro(primary, [candidate])).toMatchObject({
      kind: 'intro',
      startMs: 25_000,
      endMs: 175_000,
      source: 'automatic',
    });
  });

  it('does not turn static black frames into an intro', () => {
    const fingerprint = { intervalSeconds: 5, offsetSeconds: 15, hashes: Array(20).fill('0000000000000000') };
    expect(detectRepeatedIntro(fingerprint, [fingerprint])).toBeNull();
  });

  it('requires consensus from two episodes for production intro analysis', () => {
    const repeated = Array.from({ length: 18 }, (_, index) => (0x100000n + BigInt(index * 7919)).toString(16).padStart(16, '0'));
    const primary: FrameFingerprint = { version: 2, intervalSeconds: 5, offsetSeconds: 15, hashes: ['abc0000000000001', ...repeated], quality: Array(19).fill(0.8) };
    const first: FrameFingerprint = { version: 2, intervalSeconds: 5, offsetSeconds: 15, hashes: ['def0000000000002', ...repeated], quality: Array(19).fill(0.7) };
    const second: FrameFingerprint = { version: 2, intervalSeconds: 5, offsetSeconds: 15, hashes: ['fed0000000000003', ...repeated], quality: Array(19).fill(0.9) };
    expect(analyzeRepeatedIntro(primary, [first])).toMatchObject({ state: 'pending', reason: 'insufficient_references' });
    expect(analyzeRepeatedIntro(primary, [first, second])).toMatchObject({
      state: 'detected',
      reason: 'detected',
      referenceCount: 2,
      supportCount: 2,
      marker: { kind: 'intro', source: 'automatic' },
    });
  });

  it('rejects visually empty fingerprints even when their hashes happen to vary', () => {
    const hashes = Array.from({ length: 20 }, (_, index) => (0x2000n + BigInt(index)).toString(16).padStart(16, '0'));
    const dark: FrameFingerprint = { version: 2, intervalSeconds: 5, offsetSeconds: 15, hashes, quality: Array(20).fill(0.02) };
    expect(analyzeRepeatedIntro(dark, [dark, dark])).toMatchObject({ state: 'not-detected', reason: 'low_information' });
  });

  it('accepts only a late black transition as automatic credits evidence', () => {
    expect(creditsMarkerFromBlackSegments([{ startMs: 3_000_000, endMs: 3_002_000 }], 3_300_000))
      .toMatchObject({ kind: 'credits', startMs: 3_002_000, endMs: 3_300_000 });
    expect(creditsMarkerFromBlackSegments([{ startMs: 300_000, endMs: 302_000 }], 3_300_000)).toBeNull();
  });
});
