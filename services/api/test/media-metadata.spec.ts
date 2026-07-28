import { normalizeMetadataTitle, selectMetadataCandidate } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('metadata title matching', () => {
  it('normalizes punctuation, accents and ampersands deterministically', () => {
    expect(normalizeMetadataTitle('Léon: The Professional')).toBe('leon the professional');
    expect(normalizeMetadataTitle('Dungeons & Dragons')).toBe('dungeons and dragons');
  });

  it('prefers an exact title and year over popularity', () => {
    const selected = selectMetadataCandidate([
      { id: 1, title: 'Dune', releaseYear: 1984, popularity: 100 },
      { id: 2, title: 'Dune', releaseYear: 2021, popularity: 20 },
    ], 'Dune', 2021);
    expect(selected?.id).toBe(2);
  });

  it('rejects unrelated provider results', () => {
    expect(selectMetadataCandidate([{ id: 1, title: 'Alien', releaseYear: 1979 }], 'Foundation', 2021)).toBeNull();
  });
});
