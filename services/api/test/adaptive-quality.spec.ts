import { describe, expect, it } from 'vitest';
import { buildAdaptiveQualityPlan } from '@boltbytes/contracts';

const defaults = {
  sourceWidth: 1920,
  sourceHeight: 1080,
  sourceBitrate: 8_000_000,
  sourceHdr: false,
  planMaxHeight: 2160,
  planMaxBitrate: 20_000_000,
  serverMaxHeight: 2160,
  screenHeight: 1080,
  devicePixelRatio: 2,
  estimatedDownlinkMbps: 50,
  qualityMode: 'auto' as const,
  fixedQualityHeight: null,
  allowUpscale: true,
  dataSaver: false,
  hdrMode: 'auto' as const,
};

describe('adaptive quality plan', () => {
  it('returns at most four evenly distributed renditions including 4K', () => {
    const plan = buildAdaptiveQualityPlan(defaults);
    expect(plan.renditions).toHaveLength(4);
    expect(plan.renditions.at(-1)).toMatchObject({
      height: 2160,
      bitrate: 20_000_000,
      upscaled: true,
    });
  });

  it('respects plan, physical screen and disabled upscaling', () => {
    const plan = buildAdaptiveQualityPlan({
      ...defaults,
      planMaxHeight: 1440,
      screenHeight: 720,
      devicePixelRatio: 1,
      allowUpscale: false,
    });
    expect(plan.effectiveMaxHeight).toBe(720);
    expect(plan.renditions.at(-1)?.height).toBe(720);
  });

  it('caps data saver at 720p and three megabits', () => {
    const plan = buildAdaptiveQualityPlan({ ...defaults, dataSaver: true });
    expect(plan.effectiveMaxHeight).toBe(720);
    expect(plan.effectiveMaxBitrate).toBe(3_000_000);
  });

  it('forces SDR while retaining HDR in automatic mode', () => {
    expect(
      buildAdaptiveQualityPlan({ ...defaults, sourceHdr: true }).renditions[0]?.hdr,
    ).toBe(true);
    expect(
      buildAdaptiveQualityPlan({
        ...defaults,
        sourceHdr: true,
        hdrMode: 'force_sdr',
      }).renditions[0]?.hdr,
    ).toBe(false);
  });
});
