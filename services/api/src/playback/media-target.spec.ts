import { describe, expect, it } from 'vitest';
import { canonicalMediaTarget, deduplicateCanonicalMedia } from './media-target';

describe('canonical media targets', () => {
  it('collapses episodes from the same provider series', () => {
    const first = { id: 'e1', type: 'episode', title: 'Pilot', seriesDisplayTitle: 'FBI', seriesMetadataProviderId: '61378' };
    const second = { ...first, id: 'e2', title: 'Green Birds' };
    expect(canonicalMediaTarget(first)).toMatchObject({ targetType: 'series', targetKey: 'series:61378', displayTitle: 'FBI' });
    expect(deduplicateCanonicalMedia([first, second])).toEqual([first]);
  });

  it('allows an episode to remain an explicit playlist target', () => {
    expect(canonicalMediaTarget({ id: 'e1', type: 'episode', title: 'Pilot', seriesTitle: 'FBI' }, 'episode'))
      .toMatchObject({ targetType: 'episode', targetKey: 'episode:e1' });
  });

  it('normalizes a provider-less series identity', () => {
    expect(canonicalMediaTarget({ id: 'e1', type: 'episode', title: 'Pilot', seriesTitle: '  Anna   Pihl ' }).targetKey)
      .toBe('series-name:anna pihl');
  });
});
