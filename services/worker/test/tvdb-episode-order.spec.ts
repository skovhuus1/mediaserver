import { describe, expect, it } from 'vitest';
import { normalizeTvdbEpisodeOrder, tvdbSeasonTypePriority } from '../src/tvdb-episode-order';

describe('TVDB worker episode order', () => {
  it('normalizes safe provider order keys and rejects unsafe persisted values', () => {
    expect(normalizeTvdbEpisodeOrder(' DVD ')).toBe('dvd');
    expect(normalizeTvdbEpisodeOrder(null)).toBe('default');
    expect(() => normalizeTvdbEpisodeOrder('../dvd')).toThrow('metadata_episode_order_invalid');
  });

  it('prioritizes the series default season type for default ordering', () => {
    expect(tvdbSeasonTypePriority({
      requestedOrder: 'default',
      seasonTypeId: 4,
      defaultSeasonTypeId: 4,
      descriptors: ['DVD Order', 'dvd'],
    })).toBe(4);
  });

  it('prioritizes the explicitly selected provider order', () => {
    expect(tvdbSeasonTypePriority({
      requestedOrder: 'dvd',
      seasonTypeId: 4,
      defaultSeasonTypeId: 1,
      descriptors: ['DVD Order', 'dvd'],
    })).toBe(4);
    expect(tvdbSeasonTypePriority({
      requestedOrder: 'official',
      seasonTypeId: 4,
      defaultSeasonTypeId: 1,
      descriptors: ['DVD Order', 'dvd'],
    })).toBe(1);
  });
});
