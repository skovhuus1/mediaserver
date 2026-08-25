export interface RecommendationFeatures {
  category: string;
  genres: string[];
  credits: string[];
  creditNames: Record<string, string>;
  providerIds: string[];
  rating: number;
}

export interface RecommendationSignal extends RecommendationFeatures {
  weight: number;
  title: string;
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
      bestReason ||= `Fordi du så ${signal.title}`;
    }
    const sharedCredits = candidate.credits.filter((credit) =>
      signal.credits.includes(credit),
    ).length;
    if (sharedCredits > 0) {
      local += Math.min(50, sharedCredits * 25);
      const sharedCredit = candidate.credits.find((credit) => signal.credits.includes(credit));
      bestReason ||= sharedCredit ? `Med ${candidate.creditNames[sharedCredit] ?? signal.creditNames[sharedCredit] ?? 'en medvirkende, du kender'}` : 'Med skuespillere, du har set';
    }
    const sharedGenres = candidate.genres.filter((genre) =>
      signal.genres.includes(genre),
    ).length;
    if (sharedGenres > 0) {
      local += Math.min(36, sharedGenres * 12);
      const sharedGenre = candidate.genres.find((genre) => signal.genres.includes(genre));
      bestReason ||= sharedGenre ? `Fordi du kan lide ${sharedGenre}` : 'Matcher dine genrer';
    }
    if (candidate.category === signal.category) {
      local += 8;
    }
    score += local * signal.weight;
  }

  score += Math.max(0, Math.min(10, candidate.rating));
  return { score, reason: bestReason || 'Udvalgt fra dit bibliotek' };
}
