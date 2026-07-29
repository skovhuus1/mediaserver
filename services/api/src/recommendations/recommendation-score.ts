export interface RecommendationFeatures {
  category: string;
  genres: string[];
  credits: string[];
  providerIds: string[];
  rating: number;
}

export interface RecommendationSignal extends RecommendationFeatures {
  weight: number;
}

export function scoreRecommendation(
  candidate: RecommendationFeatures,
  signals: RecommendationSignal[],
  feedback?: 'like' | 'dislike' | 'hidden',
) {
  if (feedback === 'hidden') {
    return {
      score: Number.NEGATIVE_INFINITY,
      reason: 'Skjult af profilen',
    };
  }
  let score = feedback === 'like' ? 80 : feedback === 'dislike' ? -80 : 0;
  let bestReason = '';

  for (const signal of signals) {
    let local = 0;
    if (
      signal.providerIds.some((providerId) =>
        candidate.providerIds.includes(providerId),
      )
    ) {
      local += 60;
      bestReason ||= 'Lignende en titel, du har set';
    }
    const sharedCredits = candidate.credits.filter((credit) =>
      signal.credits.includes(credit),
    ).length;
    if (sharedCredits > 0) {
      local += Math.min(50, sharedCredits * 25);
      bestReason ||= 'Med skuespillere, du har set';
    }
    const sharedGenres = candidate.genres.filter((genre) =>
      signal.genres.includes(genre),
    ).length;
    if (sharedGenres > 0) {
      local += Math.min(36, sharedGenres * 12);
      bestReason ||= 'Matcher dine genrer';
    }
    if (candidate.category === signal.category) {
      local += 8;
    }
    score += local * signal.weight;
  }

  score += Math.max(0, Math.min(10, candidate.rating));
  return { score, reason: bestReason || 'Udvalgt fra dit bibliotek' };
}
