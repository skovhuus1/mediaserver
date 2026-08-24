import { describe, expect, it } from 'vitest';
import {
  changedChannelIds,
  LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS,
  uniqueChannelIds,
} from './live-tv-channel-visibility';

describe('Live TV channel visibility', () => {
  it('deduplicates channel ids without changing their order', () => {
    expect(uniqueChannelIds(['channel-a', 'channel-b', 'channel-a'])).toEqual(['channel-a', 'channel-b']);
  });

  it('only returns channels whose visibility actually changes', () => {
    const channels = [
      { id: 'visible', enabled: true },
      { id: 'hidden', enabled: false },
    ];

    expect(changedChannelIds(channels, false)).toEqual(['visible']);
    expect(changedChannelIds(channels, true)).toEqual(['hidden']);
  });

  it('allows large catalog visibility updates to complete without an unbounded transaction', () => {
    expect(LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS).toEqual({
      maxWait: 15_000,
      timeout: 120_000,
    });
  });
});
