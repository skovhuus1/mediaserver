export type MetadataOverrideScope = 'season' | 'episode';

export type ScopedMetadataOverride = {
  libraryId: string;
  seriesKey: string;
  scopeKey: string;
  title: string | null;
  overview: string | null;
  releaseDate: Date | null;
  imagePath: string | null;
};

export type MetadataOverrideTarget = {
  libraryId: string;
  seriesTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

export function metadataOverrideSeriesKey(seriesTitle: string): string {
  return seriesTitle.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function metadataOverrideScopeKey(
  scope: MetadataOverrideScope,
  seasonNumber: number,
  episodeNumber: number | null,
): string {
  if (scope === 'episode') {
    if (episodeNumber === null) throw new Error('metadata_override_episode_identity_missing');
    return `episode:${seasonNumber}:${episodeNumber}`;
  }
  return `season:${seasonNumber}`;
}

export function metadataOverrideMapKey(
  libraryId: string,
  seriesKey: string,
  scopeKey: string,
): string {
  return `${libraryId}:${seriesKey}:${scopeKey}`;
}

export function resolveMetadataOverrideData(
  target: MetadataOverrideTarget,
  overrides: ReadonlyMap<string, ScopedMetadataOverride>,
): Record<string, string | Date> {
  if (!target.seriesTitle || target.seasonNumber === null) return {};
  const seriesKey = metadataOverrideSeriesKey(target.seriesTitle);
  const season = overrides.get(metadataOverrideMapKey(
    target.libraryId,
    seriesKey,
    metadataOverrideScopeKey('season', target.seasonNumber, null),
  ));
  const episode = target.episodeNumber === null ? null : overrides.get(metadataOverrideMapKey(
    target.libraryId,
    seriesKey,
    metadataOverrideScopeKey('episode', target.seasonNumber, target.episodeNumber),
  ));
  return {
    ...(season?.imagePath ? { seasonPosterPath: season.imagePath } : {}),
    ...(episode?.title ? { title: episode.title } : {}),
    ...(episode?.overview ? { overview: episode.overview } : {}),
    ...(episode?.releaseDate ? { releaseDate: episode.releaseDate } : {}),
    ...(episode?.imagePath ? { episodeStillPath: episode.imagePath } : {}),
  };
}
