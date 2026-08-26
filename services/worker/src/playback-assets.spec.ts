import { describe, expect, it } from 'vitest';
import { fingerprintFrameQuality, recapLeadInFromIntro } from './playback-assets.js';

describe('playback fingerprint quality', () => {
  it('rejects flat black and white frames as visual evidence', () => {
    expect(fingerprintFrameQuality(Buffer.alloc(72, 0))).toBe(0);
    expect(fingerprintFrameQuality(Buffer.alloc(72, 255))).toBe(0);
  });

  it('scores exposed frames with visual contrast above flat frames', () => {
    const frame = Buffer.from(Array.from({ length: 72 }, (_, index) => 24 + index % 48 * 4));
    expect(fingerprintFrameQuality(frame)).toBeGreaterThan(0.25);
  });

  it('creates a conservative recap marker from the lead-in before a detected intro', () => {
    const fingerprint = {
      version: 3 as const,
      intervalSeconds: 5,
      offsetSeconds: 0,
      hashes: Array.from({ length: 24 }, (_, index) => (0x1000n + BigInt(index * 131)).toString(16).padStart(16, '0')),
      quality: Array(24).fill(0.7),
    };
    expect(recapLeadInFromIntro(fingerprint, {
      kind: 'intro',
      startMs: 75_000,
      endMs: 135_000,
      source: 'automatic',
      confidence: 0.82,
    }, 1)).toMatchObject({
      state: 'detected',
      marker: { kind: 'recap', startMs: 0, endMs: 75_000, source: 'automatic' },
    });
  });

  it('does not create recap lead-in markers from empty or too-short evidence', () => {
    const fingerprint = {
      version: 3 as const,
      intervalSeconds: 5,
      offsetSeconds: 0,
      hashes: Array(24).fill('0000000000000000'),
      quality: Array(24).fill(0.01),
    };
    expect(recapLeadInFromIntro(fingerprint, {
      kind: 'intro',
      startMs: 75_000,
      endMs: 135_000,
      source: 'automatic',
      confidence: 0.82,
    }, 1)).toMatchObject({ state: 'not-detected', reason: 'low_information', marker: null });
    expect(recapLeadInFromIntro(fingerprint, {
      kind: 'intro',
      startMs: 12_000,
      endMs: 72_000,
      source: 'automatic',
      confidence: 0.82,
    }, 1)).toMatchObject({ state: 'not-detected', reason: 'no_repeated_sequence', marker: null });
  });
});
