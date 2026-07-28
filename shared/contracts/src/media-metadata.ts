export type MetadataCandidate = {
  id: number;
  title: string;
  originalTitle?: string | null;
  releaseYear?: number | null;
  popularity?: number | null;
};

export function selectMetadataCandidate<T extends MetadataCandidate>(
  candidates: T[],
  requestedTitle: string,
  requestedYear?: number | null,
): T | null {
  const expected = normalizeMetadataTitle(requestedTitle);
  if (!expected) return null;
  const scored = candidates.map((candidate, index) => {
    const title = normalizeMetadataTitle(candidate.title);
    const originalTitle = normalizeMetadataTitle(candidate.originalTitle ?? '');
    let score = Math.min(candidate.popularity ?? 0, 100) / 100;
    if (title === expected || originalTitle === expected) score += 100;
    else if (title.startsWith(expected) || expected.startsWith(title)) score += 30;
    else if (title.includes(expected) || expected.includes(title)) score += 15;
    if (requestedYear && candidate.releaseYear) {
      const difference = Math.abs(requestedYear - candidate.releaseYear);
      score += difference === 0 ? 25 : difference === 1 ? 10 : difference > 3 ? -20 : 0;
    }
    return { candidate, index, score };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  const best = scored[0];
  return best && best.score >= 15 ? best.candidate : null;
}

export function normalizeMetadataTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
