import { classifyMediaPath } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('media path classification', () => {
  it('classifies categorized movies and extracts release years', () => {
    expect(classifyMediaPath('movie', 'Action/Dune Part Two (2024).mkv')).toEqual({
      type: 'movie',
      title: 'Dune Part Two',
      category: 'Action',
      seriesTitle: null,
      seasonNumber: null,
      episodeNumber: null,
      releaseYear: 2024,
    });
  });

  it('classifies categorized series using SxxExx and season folders', () => {
    expect(classifyMediaPath('series', 'Drama/The Last of Us/Season 01/The.Last.of.Us.S01E05.Endure.mkv')).toEqual({
      type: 'episode',
      title: 'Endure',
      category: 'Drama',
      seriesTitle: 'The Last of Us',
      seasonNumber: 1,
      episodeNumber: 5,
      releaseYear: null,
    });
  });

  it('recognizes 1x02 episodes in mixed libraries without misclassifying movies', () => {
    expect(classifyMediaPath('mixed', 'Shows/Fallout/Fallout.1x02.The.Target.mkv').type).toBe('episode');
    expect(classifyMediaPath('mixed', 'Action/Civil War (2024).mkv').type).toBe('movie');
  });
});
