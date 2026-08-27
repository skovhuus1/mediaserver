import { describe, expect, it } from 'vitest';
import { selectHlsRenditionsForCapacity, sortHlsRenditions } from './index.js';

describe('HLS rendition order', () => {
  it('places the lowest deterministic baseline first', () => {
    expect(sortHlsRenditions([
      { height: 1080, bitrate: 6_000_000, id: 'high' },
      { height: 360, bitrate: 900_000, id: 'baseline' },
      { height: 720, bitrate: 3_000_000, id: 'middle' },
    ]).map((rendition) => rendition.id)).toEqual(['baseline', 'middle', 'high']);
  });

  it('keeps the baseline while enforcing the real encoder capacity', () => {
    const renditions = [
      { height: 2160, bitrate: 20_000_000, id: '4k' },
      { height: 360, bitrate: 800_000, id: 'baseline' },
      { height: 720, bitrate: 3_000_000, id: 'middle' },
      { height: 1080, bitrate: 6_000_000, id: 'high' },
    ];

    expect(selectHlsRenditionsForCapacity(renditions, {
      maxHeight: 1080,
      maxRenditions: 2,
    }).map((rendition) => rendition.id)).toEqual(['baseline', 'high']);
    expect(selectHlsRenditionsForCapacity(renditions, {
      maxHeight: 2160,
      maxRenditions: 1,
    }).map((rendition) => rendition.id)).toEqual(['baseline']);
  });
});
