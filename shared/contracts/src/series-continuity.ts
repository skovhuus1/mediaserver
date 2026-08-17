export interface SeriesEpisodeProgress {
  positionMs: number;
  durationMs: number;
  completed: boolean;
  updatedAt?: Date | string | null;
}

export interface SeriesContinuityEpisode {
  id: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  title?: string | null;
  progress?: SeriesEpisodeProgress | null;
}

export interface SeriesContinuation {
  mediaId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  resumePositionMs: number;
}

export const orderSeriesEpisodes = <T extends SeriesContinuityEpisode>(episodes: readonly T[]): T[] =>
  [...episodes].sort((left, right) => {
    const season = (left.seasonNumber ?? Number.MAX_SAFE_INTEGER)
      - (right.seasonNumber ?? Number.MAX_SAFE_INTEGER);
    if (season !== 0) return season;
    const episode = (left.episodeNumber ?? Number.MAX_SAFE_INTEGER)
      - (right.episodeNumber ?? Number.MAX_SAFE_INTEGER);
    if (episode !== 0) return episode;
    return (left.title ?? '').localeCompare(right.title ?? '') || left.id.localeCompare(right.id);
  });

export const selectSeriesContinuation = (
  episodes: readonly SeriesContinuityEpisode[],
  afterMediaId?: string | null,
): SeriesContinuation | null => {
  const ordered = orderSeriesEpisodes(episodes);
  if (afterMediaId) {
    const index = ordered.findIndex((episode) => episode.id === afterMediaId);
    if (index >= 0) {
      const next = ordered.slice(index + 1).find((episode) => !episode.progress?.completed);
      return next ? continuation(next) : null;
    }
  }
  const unfinished = ordered
    .filter((episode) => Boolean(episode.progress && !episode.progress.completed && episode.progress.positionMs > 0))
    .sort((left, right) => progressTime(right) - progressTime(left))[0];
  if (unfinished) return continuation(unfinished);
  const next = ordered.find((episode) => !episode.progress?.completed);
  return next ? continuation(next) : null;
};

function continuation(episode: SeriesContinuityEpisode): SeriesContinuation {
  return {
    mediaId: episode.id,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    resumePositionMs: episode.progress?.completed ? 0 : Math.max(0, episode.progress?.positionMs ?? 0),
  };
}

function progressTime(episode: SeriesContinuityEpisode): number {
  const value = episode.progress?.updatedAt;
  return value ? new Date(value).getTime() : 0;
}
