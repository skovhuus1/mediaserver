import { describe, expect, it } from 'vitest';
import { fingerprintFrameQuality } from './playback-assets.js';

describe('playback fingerprint quality', () => {
  it('rejects flat black and white frames as visual evidence', () => {
    expect(fingerprintFrameQuality(Buffer.alloc(72, 0))).toBe(0);
    expect(fingerprintFrameQuality(Buffer.alloc(72, 255))).toBe(0);
  });

  it('scores exposed frames with visual contrast above flat frames', () => {
    const frame = Buffer.from(Array.from({ length: 72 }, (_, index) => 24 + index % 48 * 4));
    expect(fingerprintFrameQuality(frame)).toBeGreaterThan(0.25);
  });
});
