import { describe, expect, it } from 'vitest';
import { HOME_ROW_IDS, normalizeHomeLayout } from './home-layout';

describe('profile home layout', () => {
  it('keeps a valid custom order and appends rows omitted by older clients', () => {
    expect(normalizeHomeLayout(['continue', 'recommendations'], []).order).toEqual([
      'continue', 'recommendations', 'new_movies', 'new_series',
    ]);
  });

  it('removes duplicates and unknown rows from stored legacy values', () => {
    expect(normalizeHomeLayout(['new_series', 'unknown', 'new_series'], ['continue', 'bad', 'continue'])).toEqual({
      order: ['new_series', 'recommendations', 'continue', 'new_movies'],
      hidden: ['continue'],
    });
    expect(normalizeHomeLayout(null, null).order).toEqual([...HOME_ROW_IDS]);
  });
});
