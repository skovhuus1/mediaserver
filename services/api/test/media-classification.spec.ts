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

  it('removes release quality, source, codec, audio and group tags from movie titles', () => {
    expect(classifyMediaPath(
      'movie',
      'Music/U2 Under a Blood Red Sky 1080p WEB DL AAC 2 0 JD07.mkv',
    ).title).toBe('U2 Under a Blood Red Sky');
    expect(classifyMediaPath(
      'movie',
      'Comedy/Roast on the Coast Sverige (2025)/DANISH 1080p WEB DL DDP5 1 H264 BANDOLEROS.mkv',
    )).toMatchObject({
      title: 'Roast on the Coast Sverige',
      releaseYear: 2025,
    });
  });

  it('removes release tags after episode names', () => {
    expect(classifyMediaPath(
      'series',
      'Drama/The Last of Us/Season 01/The.Last.of.Us.S01E05.Endure.2160p.WEB-DL.H265.DDP5.1.mkv',
    ).title).toBe('Endure');
  });
});
