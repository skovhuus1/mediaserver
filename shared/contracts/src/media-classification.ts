export type LibraryKind = 'movie' | 'series' | 'mixed';

export type MediaClassification = {
  type: 'movie' | 'episode';
  title: string;
  category: string | null;
  seriesTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  releaseYear: number | null;
};

const episodePatterns = [
  /(?:^|[\s._-])s(\d{1,2})e(\d{1,3})(?=$|[\s._-])/i,
  /(?:^|[\s._-])(\d{1,2})x(\d{1,3})(?=$|[\s._-])/i,
];
const seasonDirectoryPattern = /^(?:season|sæson|s)\s*0*(\d{1,2})$/i;
const yearPattern = /(?:^|[\s([])((?:19|20)\d{2})(?=$|[\s.)\]])/;

export function classifyMediaPath(libraryKind: LibraryKind, relativePath: string): MediaClassification {
  const segments = relativePath.split('/').filter(Boolean);
  const fileName = segments.pop() ?? relativePath;
  const stem = fileName.replace(/\.[^.]+$/, '');
  const episodeMatch = episodePatterns.map((pattern) => pattern.exec(stem)).find(Boolean) ?? null;
  const seasonDirectory = segments.map((segment) => seasonDirectoryPattern.exec(cleanName(segment))).find(Boolean) ?? null;
  const isEpisode = libraryKind === 'series' || (libraryKind === 'mixed' && Boolean(episodeMatch || seasonDirectory));
  if (isEpisode) {
    const nonSeasonDirectories = segments.filter((segment) => !seasonDirectoryPattern.test(cleanName(segment)));
    const seriesTitle = cleanName(nonSeasonDirectories.at(-1) ?? stem.slice(0, episodeMatch?.index ?? stem.length)) || 'Ukendt serie';
    const category = nonSeasonDirectories.length > 1 ? cleanName(nonSeasonDirectories[0]!) : null;
    const seasonNumber = numberOrNull(episodeMatch?.[1] ?? seasonDirectory?.[1]);
    const episodeNumber = numberOrNull(episodeMatch?.[2]);
    const episodeSuffix = episodeMatch ? cleanName(stem.slice(episodeMatch.index + episodeMatch[0].length)) : '';
    return {
      type: 'episode',
      title: episodeSuffix || (episodeNumber === null ? cleanName(stem) : `Episode ${episodeNumber}`),
      category,
      seriesTitle,
      seasonNumber,
      episodeNumber,
      releaseYear: extractYear(seriesTitle),
    };
  }

  const cleanedStem = cleanName(stem);
  const releaseYear = extractYear(cleanedStem);
  const title = releaseYear === null
    ? cleanedStem
    : cleanName(cleanedStem.replace(new RegExp(`(?:\\(|\\[)?${releaseYear}(?:\\)|\\])?`), ''));
  return {
    type: 'movie',
    title: title || 'Unavngivet medie',
    category: segments.length > 0 ? cleanName(segments[0]!) : null,
    seriesTitle: null,
    seasonNumber: null,
    episodeNumber: null,
    releaseYear,
  };
}

function cleanName(value: string): string {
  return value
    .replace(/[._]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(value: string): number | null {
  const match = yearPattern.exec(value);
  return match ? Number(match[1]) : null;
}

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
