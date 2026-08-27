import { describe, expect, it } from 'vitest';
import { sortHlsRenditions } from './index.js';

describe('HLS rendition order', () => {
  it('places the lowest deterministic baseline first', () => {
    expect(sortHlsRenditions([
      { height: 1080, bitrate: 6_000_000, id: 'high' },
      { height: 360, bitrate: 900_000, id: 'baseline' },
      { height: 720, bitrate: 3_000_000, id: 'middle' },
    ]).map((rendition) => rendition.id)).toEqual(['baseline', 'middle', 'high']);
  });
});
