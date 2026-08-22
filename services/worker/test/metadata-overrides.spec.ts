import { describe, expect, it } from 'vitest';
import { metadataOverrideMapKey, metadataOverrideSeriesKey, resolveMetadataOverrideData } from '@boltbytes/contracts';

describe('scoped metadata overrides', () => {
  it('normalizes stable local series identities', () => {
    expect(metadataOverrideSeriesKey('  Anna Pihl  ')).toBe('anna pihl');
  });

  it('combines season artwork with the more specific episode fields', () => {
    const seriesKey = metadataOverrideSeriesKey('FBI');
    const overrides = new Map([
      [metadataOverrideMapKey('library-1', seriesKey, 'season:1'), {
        libraryId: 'library-1', seriesKey, scopeKey: 'season:1', title: null, overview: null,
        releaseDate: null, imagePath: '/season-custom.jpg',
      }],
      [metadataOverrideMapKey('library-1', seriesKey, 'episode:1:2'), {
        libraryId: 'library-1', seriesKey, scopeKey: 'episode:1:2', title: 'Custom episode', overview: 'Custom overview',
        releaseDate: new Date('2024-01-02T00:00:00.000Z'), imagePath: '/episode-custom.jpg',
      }],
    ]);

    expect(resolveMetadataOverrideData({
      libraryId: 'library-1', seriesTitle: 'FBI', seasonNumber: 1, episodeNumber: 2,
    }, overrides)).toEqual({
      seasonPosterPath: '/season-custom.jpg',
      title: 'Custom episode',
      overview: 'Custom overview',
      releaseDate: new Date('2024-01-02T00:00:00.000Z'),
      episodeStillPath: '/episode-custom.jpg',
    });
  });
});
