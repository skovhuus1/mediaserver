import {
  normalizePlaybackQualitySelection,
  presentPlaybackQualityLevel,
} from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('playback quality presentation', () => {
  it('presents a 4K HDR rendition without encoded separators', () => {
    expect(presentPlaybackQualityLevel(2160, 20_000_000, {
      hdr: true,
      upscaled: false,
    })).toEqual({
      resolution: '4K',
      bitrate: '20.0 Mbps',
      dynamicRange: 'HDR',
      upscaled: false,
    });
  });

  it('marks an upscaled SDR rendition explicitly', () => {
    expect(presentPlaybackQualityLevel(1080, 6_800_000, {
      hdr: false,
      upscaled: true,
    })).toEqual({
      resolution: '1080p',
      bitrate: '6.8 Mbps',
      dynamicRange: 'SDR',
      upscaled: true,
    });
  });

  it('keeps auto and valid manual levels while rejecting stale indices', () => {
    expect(normalizePlaybackQualitySelection(-1, 4)).toBe(-1);
    expect(normalizePlaybackQualitySelection(2, 4)).toBe(2);
    expect(normalizePlaybackQualitySelection(4, 4)).toBe(-1);
  });
});
