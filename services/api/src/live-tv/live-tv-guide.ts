export const DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE = 75;
export const MAX_LIVE_TV_GUIDE_PAGE_SIZE = 200;

export type LiveTvGuideWindowInput = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function resolveLiveTvGuideWindow(input: LiveTvGuideWindowInput, now = new Date()) {
  const from = validDate(input.from) ?? new Date(now.getTime() - 30 * 60_000);
  const requestedTo = validDate(input.to) ?? new Date(from.getTime() + 12 * 60 * 60_000);
  const to = new Date(Math.max(from.getTime() + 60_000, Math.min(requestedTo.getTime(), from.getTime() + 48 * 60 * 60_000)));
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(MAX_LIVE_TV_GUIDE_PAGE_SIZE, Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE)));
  return { from, to, page, pageSize };
}

function validDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
