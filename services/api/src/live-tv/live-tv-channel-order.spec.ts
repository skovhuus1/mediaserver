import { describe, expect, it } from 'vitest';
import { moveLiveTvChannelId, moveLiveTvChannelIdToPosition } from './live-tv-channel-order';

describe('Live TV channel order', () => {
  it('moves a channel before or after the target in the complete active order', () => {
    expect(moveLiveTvChannelId(['a', 'b', 'c', 'd'], 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveLiveTvChannelId(['a', 'b', 'c', 'd'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('rejects channels outside the active order', () => {
    expect(() => moveLiveTvChannelId(['a', 'b'], 'missing', 'b', 'before')).toThrow(RangeError);
  });

  it('inserts a channel at an exact one-based position and shifts the remaining channels', () => {
    expect(moveLiveTvChannelIdToPosition(['a', 'b', 'showtime', 'c'], 'showtime', 2))
      .toEqual(['a', 'showtime', 'b', 'c']);
    expect(moveLiveTvChannelIdToPosition(['a', 'showtime', 'b', 'c'], 'showtime', 4))
      .toEqual(['a', 'b', 'c', 'showtime']);
  });

  it('keeps an unchanged position stable and clamps positions beyond the active lineup', () => {
    expect(moveLiveTvChannelIdToPosition(['a', 'b', 'c'], 'b', 2)).toEqual(['a', 'b', 'c']);
    expect(moveLiveTvChannelIdToPosition(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
  });

  it('rejects invalid positions and channels outside the active lineup', () => {
    expect(() => moveLiveTvChannelIdToPosition(['a', 'b'], 'a', 0)).toThrow(RangeError);
    expect(() => moveLiveTvChannelIdToPosition(['a', 'b'], 'missing', 1)).toThrow(RangeError);
  });
});
