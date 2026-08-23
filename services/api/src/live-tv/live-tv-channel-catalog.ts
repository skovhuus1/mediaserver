export const MAX_ADMIN_LIVE_TV_CHANNELS = 50_000;
export const DEFAULT_ADMIN_CHANNEL_PAGE_SIZE = 100;
export const MAX_ADMIN_CHANNEL_PAGE_SIZE = 250;

export type VisibilityCountRow = {
  enabled: boolean;
  _count: true | { _all?: number } | undefined;
};

export type GroupCountRow = VisibilityCountRow & {
  groupName: string | null;
};

export function visibilityCounts(rows: readonly VisibilityCountRow[]) {
  const visible = countValue(rows.find((row) => row.enabled));
  const hidden = countValue(rows.find((row) => !row.enabled));
  return { total: visible + hidden, visible, hidden };
}

export function channelGroupFacets(rows: readonly GroupCountRow[]) {
  const groups = new Map<string, { name: string; total: number; visible: number; hidden: number }>();
  for (const row of rows) {
    const name = row.groupName?.trim();
    if (!name) continue;
    const current = groups.get(name) ?? { name, total: 0, visible: 0, hidden: 0 };
    const count = countValue(row);
    current.total += count;
    if (row.enabled) current.visible += count;
    else current.hidden += count;
    groups.set(name, current);
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, 'da'));
}

function countValue(row: VisibilityCountRow | undefined): number {
  return row && typeof row._count === 'object' ? row._count._all ?? 0 : 0;
}
