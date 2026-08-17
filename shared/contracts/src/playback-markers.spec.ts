import { describe, expect, it } from 'vitest';
import {
  buildTrickplayCues,
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

  it('accepts only a late black transition as automatic credits evidence', () => {
    expect(creditsMarkerFromBlackSegments([{ startMs: 3_000_000, endMs: 3_002_000 }], 3_300_000))
      .toMatchObject({ kind: 'credits', startMs: 3_002_000, endMs: 3_300_000 });
    expect(creditsMarkerFromBlackSegments([{ startMs: 300_000, endMs: 302_000 }], 3_300_000)).toBeNull();
  });
});
