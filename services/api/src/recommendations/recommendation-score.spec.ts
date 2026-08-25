import { describe, expect, it } from 'vitest';
import { scoreRecommendation, type RecommendationFeatures, type RecommendationSignal } from './recommendation-score';

const candidate: RecommendationFeatures = { category: 'series', genres: ['Drama'], credits: ['person:1'], creditNames: { 'person:1': 'Missy Peregrym' }, providerIds: ['tmdb:42'], rating: 8 };
const signal: RecommendationSignal = { category: 'series', genres: ['Drama'], credits: ['person:1'], creditNames: { 'person:1': 'Missy Peregrym' }, providerIds: ['tmdb:42'], rating: 7, title: 'FBI', weight: 1 };

describe('recommendation scoring', () => {
  it('uses the strongest concrete viewing reason', () => {
    expect(scoreRecommendation(candidate, [signal])).toEqual({ score: 113, reason: 'Fordi du så FBI' });
  });
  it('excludes hidden feedback completely', () => {
    expect(scoreRecommendation(candidate, [signal], 'hidden').score).toBe(Number.NEGATIVE_INFINITY);
  });
});
