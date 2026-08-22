import { describe, expect, it } from 'vitest';
import {
  buildSdrColorMetadataArguments,
  resolveVideoColorPipeline,
} from '../src/video-color';

describe('video color pipeline', () => {
  it('tone maps an HDR source when the client requires SDR', () => {
    const pipeline = resolveVideoColorPipeline({ sourceIsHdr: true, preserveHdr: false });

    expect(pipeline.toneMappedToSdr).toBe(true);
    expect(pipeline.outputPixelFormat).toBe('yuv420p');
    expect(pipeline.filter).toContain('zscale=t=linear:npl=100');
    expect(pipeline.filter).toContain('tonemap=tonemap=hable:desat=0');
    expect(pipeline.filter).toContain('zscale=t=bt709:m=bt709:r=tv');
  });

  it('preserves the ten-bit HDR path when HDR output is requested', () => {
    const pipeline = resolveVideoColorPipeline({ sourceIsHdr: true, preserveHdr: true });

    expect(pipeline).toEqual({
      filter: '[subtitlePrepared]null[prepared]',
      outputPixelFormat: 'p010le',
      toneMappedToSdr: false,
    });
  });

  it('does not tone map SDR sources', () => {
    const pipeline = resolveVideoColorPipeline({ sourceIsHdr: false, preserveHdr: false });

    expect(pipeline.filter).toBe('[subtitlePrepared]null[prepared]');
    expect(pipeline.toneMappedToSdr).toBe(false);
  });

  it('marks every tone-mapped output rendition explicitly as BT.709 limited range', () => {
    expect(buildSdrColorMetadataArguments(2, true)).toEqual([
      '-color_primaries:v:2', 'bt709',
      '-color_trc:v:2', 'bt709',
      '-colorspace:v:2', 'bt709',
      '-color_range:v:2', 'tv',
    ]);
    expect(buildSdrColorMetadataArguments(2, false)).toEqual([]);
  });
});
