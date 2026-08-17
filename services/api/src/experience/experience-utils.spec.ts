import { describe, expect, it } from 'vitest';
import {
  buildSeriesSeasons,
  cleanLocalTitle,
  readLocalCredits,
  readLocalGenres,
  readSimilarProviderIds,
  slugifyDiscovery,
} from './experience-utils';

describe('experience utilities', () => {
  it('normalizes Danish discovery keys and release filenames', () => {
    expect(slugifyDiscovery('Badehotellet på Øen')).toBe('badehotellet-pa-oen');
    expect(cleanLocalTitle('FBI.S01E01.Pilot.1080p.WEB-DL.H264')).toBe('FBI S01E01 Pilot');
  });

  it('parses provider credits, genres and similar ids defensively', () => {
    expect(readLocalCredits({ cast: [{ id: 12, name: 'Anna Actor', character: 'Anna' }] })[0]?.key).toBe('tmdb-12-anna-actor');
    expect(readLocalGenres(['Drama', { name: 'Crime' }, 'Drama'])).toEqual(['Drama', 'Crime']);
    expect(readSimilarProviderIds([1, '2', { id: 3 }, null])).toEqual(['1', '2', '3']);
  });

  it('builds ordered seasons, resume state and the next unwatched episode', () => {
    const episodes = [
      { id: 'e2', title: 'To', overview: null, seasonNumber: 1, episodeNumber: 2, releaseYear: 2024, stillPath: null, posterPath: null, durationMs: 1_000, markers: [] },
      { id: 'e1', title: 'En', overview: null, seasonNumber: 1, episodeNumber: 1, releaseYear: 2024, stillPath: null, posterPath: null, durationMs: 1_000, markers: [] },
      { id: 'e3', title: 'Tre', overview: null, seasonNumber: 2, episodeNumber: 1, releaseYear: 2025, stillPath: null, posterPath: null, durationMs: 1_000, markers: [] },
    ];
    const result = buildSeriesSeasons(episodes, [
      { mediaId: 'e1', positionMs: 950, completed: false, updatedAt: new Date('2026-01-01') },
      { mediaId: 'e2', positionMs: 400, completed: false, updatedAt: new Date('2026-01-02') },
    ], 'e1');
    expect(result.seasons.map((season) => season.number)).toEqual([1, 2]);
    expect(result.seasons[0]?.watchedCount).toBe(1);
    expect(result.resumeEpisode?.id).toBe('e2');
    expect(result.nextEpisode?.id).toBe('e3');
  });
});
