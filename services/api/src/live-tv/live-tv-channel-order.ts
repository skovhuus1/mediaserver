export type LiveTvChannelPlacement = 'before' | 'after';

export function moveLiveTvChannelId(
  orderedIds: readonly string[],
  sourceId: string,
  targetId: string,
  placement: LiveTvChannelPlacement,
): string[] {
  if (sourceId === targetId) return [...orderedIds];
  if (!orderedIds.includes(sourceId) || !orderedIds.includes(targetId)) {
    throw new RangeError('Both channels must be present in the active order');
  }
  const next = orderedIds.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, sourceId);
  return next;
}
