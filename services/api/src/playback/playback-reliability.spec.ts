import {
  resolveAccurateTranscodeSeek,
  resolveInitialPlaybackQualitySelection,
  selectSeriesContinuation,
} from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('playback reliability contracts', () => {
  it('splits resume seeking into a fast input seek and an accurate output seek', () => {
    expect(resolveAccurateTranscodeSeek(62_345)).toEqual({
      inputSeekSeconds: 52.345,
      outputSeekSeconds: 10,
      timelineOffsetSeconds: 62.345,
    });
  });

  it('keeps Auto adaptive and locks fixed/original quality deterministically', () => {
    const levels = [{ height: 360 }, { height: 720 }, { height: 1080 }];
    expect(resolveInitialPlaybackQualitySelection('auto', null, levels)).toBe(-1);
    expect(resolveInitialPlaybackQualitySelection('fixed', 720, levels)).toBe(1);
    expect(resolveInitialPlaybackQualitySelection('original', null, levels)).toBe(2);
  });

  it('resumes the latest unfinished episode and advances past an explicit episode', () => {
    const episodes = [
      { id: 'e1', seasonNumber: 1, episodeNumber: 1, progress: { positionMs: 0, durationMs: 1, completed: true, updatedAt: '2026-01-01' } },
      { id: 'e2', seasonNumber: 1, episodeNumber: 2, progress: { positionMs: 500, durationMs: 1_000, completed: false, updatedAt: '2026-02-01' } },
      { id: 'e3', seasonNumber: 1, episodeNumber: 3, progress: null },
    ];
    expect(selectSeriesContinuation(episodes)).toMatchObject({ mediaId: 'e2', resumePositionMs: 500 });
    expect(selectSeriesContinuation(episodes, 'e2')).toMatchObject({ mediaId: 'e3', resumePositionMs: 0 });
  });
});
