export type MediaTargetType = 'media' | 'movie' | 'series' | 'episode';

export type MediaTargetSource = {
  id: string;
  type: string;
  title: string;
  seriesTitle?: string | null;
  seriesDisplayTitle?: string | null;
  seriesMetadataProviderId?: string | null;
};

export type CanonicalMediaTarget = {
  targetType: MediaTargetType;
  targetKey: string;
  mediaId: string;
  displayTitle: string;
};

export function canonicalMediaTarget(
  media: MediaTargetSource,
  requested: MediaTargetType | 'auto' = 'auto',
): CanonicalMediaTarget {
  const inferred = media.type === 'episode' ? 'series' : media.type === 'movie' ? 'movie' : 'media';
  const targetType = requested === 'auto' ? inferred : requested;
  if (targetType === 'series') {
    const displayTitle = media.seriesDisplayTitle ?? media.seriesTitle ?? media.title;
    const identity = media.seriesMetadataProviderId
      ? `series:${media.seriesMetadataProviderId}`
      : `series-name:${normalizeTargetText(displayTitle)}`;
    return { targetType, targetKey: identity, mediaId: media.id, displayTitle };
  }
  if (targetType === 'episode') {
    return { targetType, targetKey: `episode:${media.id}`, mediaId: media.id, displayTitle: media.title };
  }
  return {
    targetType,
    targetKey: `${targetType === 'movie' ? 'movie' : 'media'}:${media.id}`,
    mediaId: media.id,
    displayTitle: media.title,
  };
}

export function normalizeTargetText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('da-DK');
}

export function deduplicateCanonicalMedia<T extends MediaTargetSource>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalMediaTarget(item).targetKey;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
