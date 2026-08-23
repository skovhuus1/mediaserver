export const DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE = 75;
export const MAX_LIVE_TV_GUIDE_PAGE_SIZE = 200;

export type LiveTvGuideWindowInput = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type LiveTvGuideProgramRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  iconUrl: string | null;
  episode: string | null;
};

export type LiveTvGuideChannelRow = {
  id: string;
  name: string;
  groupName: string | null;
  logoUrl: string | null;
  programs: LiveTvGuideProgramRow[];
};

export function resolveLiveTvGuideWindow(input: LiveTvGuideWindowInput, now = new Date()) {
  const from = validDate(input.from) ?? new Date(now.getTime() - 30 * 60_000);
  const requestedTo = validDate(input.to) ?? new Date(from.getTime() + 12 * 60 * 60_000);
  const to = new Date(Math.max(from.getTime() + 60_000, Math.min(requestedTo.getTime(), from.getTime() + 48 * 60 * 60_000)));
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(MAX_LIVE_TV_GUIDE_PAGE_SIZE, Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_LIVE_TV_GUIDE_PAGE_SIZE)));
  return { from, to, page, pageSize };
}

export function presentLiveTvGuidePrograms(channel: LiveTvGuideChannelRow, from: Date, to: Date) {
  if (channel.programs.length > 0) {
    return channel.programs.map((program) => ({
      id: program.id, startsAt: program.startsAt, endsAt: program.endsAt,
      title: program.title, subtitle: program.subtitle, description: program.description, category: program.category,
      iconUrl: program.iconUrl, episode: program.episode, source: 'xmltv' as const, recordable: true,
    }));
  }
  return [{
    id: `m3u:${channel.id}:${from.getTime()}`,
    startsAt: from,
    endsAt: to,
    title: channel.name,
    subtitle: channel.groupName ?? 'Live TV',
    description: 'Kanalnavn, logo og gruppe er importeret fra M3U-listen. Tilføj eller autoopdag XMLTV for detaljerede programtider.',
    category: channel.groupName,
    iconUrl: channel.logoUrl,
    episode: null,
    source: 'm3u' as const,
    recordable: false,
  }];
}

function validDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
