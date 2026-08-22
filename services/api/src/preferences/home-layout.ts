export const HOME_ROW_IDS = ['recommendations', 'continue', 'new_movies', 'new_series'] as const;
export type HomeRowId = typeof HOME_ROW_IDS[number];

export function normalizeHomeLayout(order: unknown, hidden: unknown) {
  const valid = new Set<string>(HOME_ROW_IDS);
  const normalizedOrder = uniqueRows(order, valid);
  const normalizedHidden = uniqueRows(hidden, valid);
  return {
    order: [...normalizedOrder, ...HOME_ROW_IDS.filter((row) => !normalizedOrder.includes(row))],
    hidden: normalizedHidden,
  };
}

function uniqueRows(value: unknown, valid: Set<string>): HomeRowId[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<HomeRowId[]>((rows, entry) => {
    if (typeof entry === 'string' && valid.has(entry) && !rows.includes(entry as HomeRowId)) rows.push(entry as HomeRowId);
    return rows;
  }, []);
}
