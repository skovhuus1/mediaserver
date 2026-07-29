import { describe, expect, it } from 'vitest';
import {
  RecommendationFeatures,
  scoreRecommendation,
} from '../src/recommendations/recommendation-score';

const base: RecommendationFeatures = {
  category: 'series',
  genres: ['Drama', 'Crime'],
  credits: ['actor:1', 'actor:2'],
  providerIds: ['tmdb:22'],
  rating: 8.2,
};

describe('recommendation score', () => {
  it('applies similar, cast, genre, category and rating weights', () => {
    const result = scoreRecommendation(base, [{ ...base, weight: 1 }]);
    expect(result.score).toBe(60 + 50 + 24 + 8 + 8.2);
  });

  it('applies profile feedback without leaking into another score', () => {
    expect(scoreRecommendation(base, [], 'like').score).toBe(88.2);
    expect(scoreRecommendation(base, [], 'dislike').score).toBe(-71.8);
  });

  it('excludes hidden titles completely', () => {
    expect(scoreRecommendation(base, [], 'hidden').score).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });
});
