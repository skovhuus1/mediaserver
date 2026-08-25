import { describe, expect, it } from 'vitest';
import { HOME_ROW_IDS, normalizeHomeLayout } from './home-layout';

describe('profile home layout', () => {
  it('keeps a valid custom order and appends rows omitted by older clients', () => {
    expect(normalizeHomeLayout(['continue', 'recommendations'], []).order).toEqual([
      'continue', 'recommendations', 'watchlist', 'latest_episodes', 'recently_added', 'new_movies', 'new_series', 'genres', 'popular',
    ]);
  });

  it('removes duplicates and unknown rows from stored legacy values', () => {
    expect(normalizeHomeLayout(['new_series', 'unknown', 'new_series'], ['continue', 'bad', 'continue'])).toEqual({
      order: ['new_series', 'recommendations', 'continue', 'watchlist', 'latest_episodes', 'recently_added', 'new_movies', 'genres', 'popular'],
      hidden: ['continue'],
    });
    expect(normalizeHomeLayout(null, null).order).toEqual([...HOME_ROW_IDS]);
  });

  it('preserves valid dynamic playlist rows and rejects malformed ids', () => {
    const playlist = 'playlist:123e4567-e89b-42d3-a456-426614174000';
    expect(normalizeHomeLayout([playlist, 'playlist:not-a-uuid'], [playlist])).toMatchObject({
      order: [playlist, 'recommendations', 'continue', 'watchlist', 'latest_episodes', 'recently_added', 'new_movies', 'new_series', 'genres', 'popular'],
      hidden: [playlist],
    });
  });
});
