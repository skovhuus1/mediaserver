import { groupBySeriesIdentity, seriesIdentity } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('series identity', () => {
  it('groups episodes with different scanner titles by provider id', () => {
    const groups = groupBySeriesIdentity([
      {
        metadataProvider: 'tvdb',
        seriesMetadataProviderId: '270633',
        seriesDisplayTitle: 'The Sinner',
        seriesTitle: 'NORDiC 1080p S04E08',
      },
      {
        metadataProvider: 'tvdb',
        seriesMetadataProviderId: '270633',
        seriesDisplayTitle: 'The Sinner',
        seriesTitle: 'NORDiC 1080p S04E07',
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('falls back to the cleaned metadata title when provider ids are absent', () => {
    expect(seriesIdentity({
      seriesDisplayTitle: 'The Sinner',
      seriesTitle: 'unrelated scanner value',
    })).toBe('display:thesinner');
  });

  it('does not combine different provider series', () => {
    expect(groupBySeriesIdentity([
      { metadataProvider: 'tvdb', seriesMetadataProviderId: '1' },
      { metadataProvider: 'tvdb', seriesMetadataProviderId: '2' },
    ])).toHaveLength(2);
  });
});
