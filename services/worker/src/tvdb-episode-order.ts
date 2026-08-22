const ORDER_KEY = /^[a-z0-9_-]{1,40}$/;

export function normalizeTvdbEpisodeOrder(value: string | null | undefined): string {
  const order = value?.trim().toLowerCase() || 'default';
  if (!ORDER_KEY.test(order)) {
    throw new Error('metadata_episode_order_invalid: Saved TVDB episode order is unsafe');
  }
  return order;
}

export function tvdbSeasonTypePriority(input: {
  requestedOrder: string;
  seasonTypeId: number | null;
  defaultSeasonTypeId: number | null;
  descriptors: Array<string | null>;
}): number {
  const requested = normalizeTvdbEpisodeOrder(input.requestedOrder);
  if (
    requested === 'default'
    && input.seasonTypeId !== null
    && input.seasonTypeId === input.defaultSeasonTypeId
  ) return 4;

  const descriptors = input.descriptors
    .flatMap((value) => value?.trim().toLowerCase() || [])
    .filter((value) => ORDER_KEY.test(value));
  if (requested !== 'default' && descriptors.includes(requested)) return 4;
  if (requested === 'default' && descriptors.some((value) => ['official', 'aired', 'default'].includes(value))) return 3;
  return 1;
}
