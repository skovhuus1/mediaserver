import { describe, expect, it } from 'vitest';
import { liveTvPauseSegmentCount } from '../src/live-tv.js';

describe('Live TV pause buffer', () => {
  it('keeps two hours by default using four-second segments', () => {
    expect(liveTvPauseSegmentCount(undefined)).toBe(1_800);
    expect(liveTvPauseSegmentCount('7200')).toBe(1_800);
  });

  it('clamps unsafe values to one minute through two hours', () => {
    expect(liveTvPauseSegmentCount('1')).toBe(15);
    expect(liveTvPauseSegmentCount('99999')).toBe(1_800);
    expect(liveTvPauseSegmentCount('invalid')).toBe(1_800);
  });
});
