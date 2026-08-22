export type LocalCredit = {
  key: string;
  providerId: string | null;
  name: string;
  role: string | null;
  department: string | null;
  profilePath: string | null;
};

export type SeriesEpisodeInput = {
  id: string;
  title: string;
  overview: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  releaseYear: number | null;
  stillPath: string | null;
  posterPath: string | null;
  durationMs: number | null;
  markers: Array<{ kind: string; startMs: number; endMs: number; source: string }>;
  playback: Record<string, unknown>;
};

export type RelatedTitleSignal = {
  providerId: string | null;
  category: string | null;
  genres: string[];
  people: string[];
  rating: number | null;
};

export function scoreRelatedTitle(source: RelatedTitleSignal, candidate: RelatedTitleSignal, similarProviderIds: Set<string>) {
  const providerSimilar = Boolean(candidate.providerId && similarProviderIds.has(candidate.providerId));
  const sharedPeople = candidate.people.filter((key) => source.people.includes(key)).length;
  const sharedGenres = candidate.genres.filter((genre) => source.genres.some((sourceGenre) => sourceGenre.toLocaleLowerCase('da') === genre.toLocaleLowerCase('da'))).length;
  const sameCategory = Boolean(source.category && candidate.category && source.category === candidate.category);
  const score = (providerSimilar ? 60 : 0) + Math.min(50, sharedPeople * 25) + Math.min(36, sharedGenres * 12) + (sameCategory ? 8 : 0) + Math.max(0, Math.min(10, candidate.rating ?? 0));
  const reason = providerSimilar ? 'Lignende titel' : sharedPeople > 0 ? 'Med samme medvirkende' : sharedGenres > 0 ? `Fordi du kan lide ${candidate.genres.find((genre) => source.genres.some((sourceGenre) => sourceGenre.toLocaleLowerCase('da') === genre.toLocaleLowerCase('da')))}` : sameCategory ? 'Samme kategori' : 'Populær på din server';
  return { score, reason };
}

export type SeriesHistoryInput = {
  mediaId: string;
  positionMs: number;
  completed: boolean;
  updatedAt: Date;
};

export function slugifyDiscovery(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/gi, (letter) => letter === 'Æ' ? 'AE' : 'ae')
    .replace(/ø/gi, (letter) => letter === 'Ø' ? 'O' : 'o')
    .replace(/å/gi, (letter) => letter === 'Å' ? 'A' : 'a')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function cleanLocalTitle(value: string) {
  return value
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:2160p|1080p|720p|480p|uhd|hdr10\+?|dv|web[ .-]?dl|webrip|bluray|brrip|x26[45]|h\.?26[45]|hevc)\b.*$/i, '')
    .trim();
}

export function readLocalGenres(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) return [entry.trim()];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const name = (entry as Record<string, unknown>).name;
      return typeof name === 'string' && name.trim() ? [name.trim()] : [];
    }
    return [];
  }))];
}

export function readLocalCredits(value: unknown): LocalCredit[] {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const sources = Array.isArray(value)
    ? value
    : record
      ? [
        ...(Array.isArray(record.cast) ? record.cast : []),
        ...(Array.isArray(record.crew) ? record.crew : []),
        ...(Array.isArray(record.people) ? record.people : []),
      ]
      : [];
  const seen = new Set<string>();
  return sources.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const name = text(item.name ?? item.originalName ?? item.original_name);
    if (!name) return [];
    const providerId = identifier(item.id ?? item.providerId ?? item.provider_id);
    const key = providerId ? `tmdb-${providerId}-${slugifyDiscovery(name)}` : `name-${slugifyDiscovery(name)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      key,
      providerId,
      name,
      role: text(item.character ?? item.role ?? item.job),
      department: text(item.knownForDepartment ?? item.known_for_department ?? item.department),
      profilePath: image(item.profilePath ?? item.profile_path ?? item.image),
    }];
  }).slice(0, 30);
}

export function readSimilarProviderIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') return [String(entry)];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const id = identifier((entry as Record<string, unknown>).id ?? (entry as Record<string, unknown>).providerId);
      return id ? [id] : [];
    }
    return [];
  }))];
}

export function buildSeriesSeasons(episodes: SeriesEpisodeInput[], histories: SeriesHistoryInput[], anchorId: string) {
  const latestHistory = new Map<string, SeriesHistoryInput>();
  [...histories]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .forEach((history) => {
      if (!latestHistory.has(history.mediaId)) latestHistory.set(history.mediaId, history);
    });
  const normalized = [...episodes]
    .sort((left, right) => (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0)
      || (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0)
      || left.title.localeCompare(right.title, 'da'))
    .map((episode) => {
      const history = latestHistory.get(episode.id);
      const watched = Boolean(history?.completed)
        || Boolean(episode.durationMs && history && history.positionMs / episode.durationMs >= 0.9);
      const progressPercent = episode.durationMs && history
        ? Math.max(0, Math.min(100, Math.round((history.positionMs / episode.durationMs) * 100)))
        : 0;
      return {
        ...episode,
        watched,
        positionMs: watched ? 0 : history?.positionMs ?? 0,
        progressPercent: watched ? 100 : progressPercent,
        lastPlayedAt: history?.updatedAt.toISOString() ?? null,
      };
    });
  const resumable = normalized
    .filter((episode) => !episode.watched && episode.positionMs > 0)
    .sort((left, right) => String(right.lastPlayedAt).localeCompare(String(left.lastPlayedAt)))[0];
  const resumeEpisode = resumable ?? normalized.find((episode) => !episode.watched) ?? normalized[0] ?? null;
  const resumeIndex = resumeEpisode ? normalized.findIndex((episode) => episode.id === resumeEpisode.id) : -1;
  const nextEpisode = resumeIndex >= 0 ? normalized.slice(resumeIndex + 1).find((episode) => !episode.watched) ?? null : null;
  const anchor = normalized.find((episode) => episode.id === anchorId) ?? resumeEpisode;
  const seasonNumbers = [...new Set(normalized.map((episode) => episode.seasonNumber ?? 0))];
  const seasons = seasonNumbers.map((number) => {
    const seasonEpisodes = normalized.filter((episode) => (episode.seasonNumber ?? 0) === number);
    return {
      number,
      label: number === 0 ? 'Specials' : `Sæson ${number}`,
      episodeCount: seasonEpisodes.length,
      watchedCount: seasonEpisodes.filter((episode) => episode.watched).length,
      durationMs: seasonEpisodes.reduce((sum, episode) => sum + (episode.durationMs ?? 0), 0),
      episodes: seasonEpisodes,
    };
  });
  return { seasons, resumeEpisode, nextEpisode, selectedSeasonNumber: anchor?.seasonNumber ?? seasons[0]?.number ?? 0 };
}

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const identifier = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const image = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
