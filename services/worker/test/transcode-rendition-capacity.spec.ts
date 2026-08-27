import {
  resolveCpuTranscodeProfile,
  selectHlsRenditionsForCapacity,
} from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('transcode rendition capacity', () => {
  it('does not oversubscribe a four-thread software worker', () => {
    const profile = resolveCpuTranscodeProfile({
      availableThreads: 4,
      renditionCount: 4,
    });
    const selected = selectHlsRenditionsForCapacity([
      { height: 360, bitrate: 800_000 },
      { height: 720, bitrate: 3_000_000 },
      { height: 1080, bitrate: 6_000_000 },
      { height: 2160, bitrate: 20_000_000 },
    ], profile);

    expect(profile.maxRenditions).toBe(1);
    expect(profile.maxHeight).toBe(1080);
    expect(selected).toEqual([{ height: 360, bitrate: 800_000 }]);
  });
});
