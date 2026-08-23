import { describe, expect, it } from 'vitest';
import {
  channelGroupFacets,
  MAX_ADMIN_LIVE_TV_CHANNELS,
  visibilityCounts,
} from './live-tv-channel-catalog';

describe('Live TV channel catalog', () => {
  it('supports bulk administration of up to 50,000 channels', () => {
    expect(MAX_ADMIN_LIVE_TV_CHANNELS).toBe(50_000);
  });

  it('aggregates visibility and group counts without loading channel rows', () => {
    expect(visibilityCounts([
      { enabled: true, _count: { _all: 40_000 } },
      { enabled: false, _count: { _all: 10_000 } },
    ])).toEqual({ total: 50_000, visible: 40_000, hidden: 10_000 });
    expect(channelGroupFacets([
      { groupName: 'Sport', enabled: true, _count: { _all: 120 } },
      { groupName: 'Sport', enabled: false, _count: { _all: 8 } },
      { groupName: 'Film', enabled: true, _count: { _all: 42 } },
    ])).toEqual([
      { name: 'Film', total: 42, visible: 42, hidden: 0 },
      { name: 'Sport', total: 128, visible: 120, hidden: 8 },
    ]);
  });
});
