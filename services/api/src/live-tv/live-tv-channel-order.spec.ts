import { describe, expect, it } from 'vitest';
import { moveLiveTvChannelId } from './live-tv-channel-order';

describe('Live TV channel order', () => {
  it('moves a channel before or after the target in the complete active order', () => {
    expect(moveLiveTvChannelId(['a', 'b', 'c', 'd'], 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveLiveTvChannelId(['a', 'b', 'c', 'd'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('rejects channels outside the active order', () => {
    expect(() => moveLiveTvChannelId(['a', 'b'], 'missing', 'b', 'before')).toThrow(RangeError);
  });
});
