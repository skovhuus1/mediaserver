export const HOME_ROW_IDS = [
  'recommendations',
  'continue',
  'watchlist',
  'latest_episodes',
  'recently_added',
  'new_movies',
  'new_series',
  'genres',
  'popular',
] as const;
export const HOME_ROW_ID_PATTERN = /^(?:recommendations|continue|watchlist|latest_episodes|recently_added|new_movies|new_series|genres|popular|playlist:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
export type HomeRowId = string;

export function normalizeHomeLayout(order: unknown, hidden: unknown) {
  const normalizedOrder = uniqueRows(order);
  const normalizedHidden = uniqueRows(hidden);
  return {
    order: [...normalizedOrder, ...HOME_ROW_IDS.filter((row) => !normalizedOrder.includes(row))],
    hidden: normalizedHidden,
  };
}

function uniqueRows(value: unknown): HomeRowId[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<HomeRowId[]>((rows, entry) => {
    if (typeof entry === 'string' && HOME_ROW_ID_PATTERN.test(entry) && !rows.includes(entry)) rows.push(entry);
    return rows;
  }, []);
}
