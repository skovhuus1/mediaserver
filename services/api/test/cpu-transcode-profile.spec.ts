import { describe, expect, it } from 'vitest';
import { resolveCpuTranscodeProfile } from '@boltbytes/contracts';

describe('CPU transcode profile', () => {
  it('reserves one logical CPU and shares the remaining budget across renditions', () => {
    expect(resolveCpuTranscodeProfile({
      availableThreads: 8,
      renditionCount: 3,
    })).toEqual({
      preset: 'veryfast',
      totalThreads: 7,
      filterThreads: 1,
      threadsPerRendition: 2,
      maxHeight: 1080,
      maxRenditions: 3,
    });
  });

  it('validates unsafe environment values and caps explicit overrides', () => {
    expect(resolveCpuTranscodeProfile({
      availableThreads: 4,
      renditionCount: 4,
      configuredThreads: '99',
      configuredRenditions: '9',
      configuredPreset: 'placebo',
      configuredMaxHeight: '9999',
    })).toMatchObject({
      preset: 'veryfast',
      totalThreads: 4,
      maxHeight: 2160,
      maxRenditions: 4,
    });
  });
});
