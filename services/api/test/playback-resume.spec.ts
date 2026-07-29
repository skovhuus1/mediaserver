import { playbackResumeTargetSeconds } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('playback resume target', () => {
  it('converts the persisted millisecond position to seconds', () => {
    expect(playbackResumeTargetSeconds(125_500, 600)).toBe(125.5);
  });

  it('keeps the resume target when HLS duration is not available yet', () => {
    expect(playbackResumeTargetSeconds(125_500, Number.NaN)).toBe(125.5);
  });

  it('does not request a seek for fresh playback', () => {
    expect(playbackResumeTargetSeconds(0, 600)).toBeNull();
  });

  it('clamps corrupt positions just before the media end', () => {
    expect(playbackResumeTargetSeconds(900_000, 600)).toBe(599.75);
  });
});
