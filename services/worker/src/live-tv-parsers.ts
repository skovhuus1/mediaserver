export type ParsedM3uEntry = {
  name: string;
  url: string;
  tvgId: string | null;
  tvgName: string | null;
  logoUrl: string | null;
  groupName: string | null;
  channelNumber: number | null;
};

export type ParsedXmlTv = {
  channels: Map<string, { name: string | null; logoUrl: string | null }>;
  programs: Array<{ channelExternalId: string; startsAt: Date; endsAt: Date; title: string; subtitle: string | null; description: string | null; category: string | null; iconUrl: string | null; episode: string | null }>;
};

export function parseM3u(content: string): ParsedM3uEntry[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries: ParsedM3uEntry[] = [];
  let metadata: Record<string, string> | null = null;
  let displayName = '';
  let extGroup: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      metadata = {};
      for (const match of line.matchAll(/([A-Za-z0-9_-]+)="([^"]*)"/g)) metadata[match[1]!.toLowerCase()] = decodeEntities(match[2]!);
      const comma = line.indexOf(',');
      displayName = decodeEntities(comma >= 0 ? line.slice(comma + 1).trim() : metadata['tvg-name'] ?? 'Ukendt kanal');
      extGroup = null;
      continue;
    }
    if (line.startsWith('#EXTGRP:')) { extGroup = decodeEntities(line.slice(8).trim()); continue; }
    if (line.startsWith('#')) continue;
    if (!/^https?:\/\//i.test(line)) { metadata = null; continue; }
    const name = displayName || metadata?.['tvg-name'] || 'Ukendt kanal';
    const numberRaw = metadata?.['tvg-chno'] ?? metadata?.['channel-number'];
    const number = numberRaw ? Number.parseInt(numberRaw, 10) : Number.NaN;
    entries.push({ name, url: line, tvgId: clean(metadata?.['tvg-id']), tvgName: clean(metadata?.['tvg-name']),
      logoUrl: clean(metadata?.['tvg-logo']), groupName: clean(metadata?.['group-title']) ?? extGroup,
      channelNumber: Number.isInteger(number) && number > 0 ? number : null });
    metadata = null; displayName = ''; extGroup = null;
  }
  return entries;
}

export function parseXmlTv(content: string): ParsedXmlTv {
  const channels = new Map<string, { name: string | null; logoUrl: string | null }>();
  for (const match of content.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(match[1]!, 'id');
    if (!id) continue;
    channels.set(id, { name: tag(match[2]!, 'display-name'), logoUrl: tagAttribute(match[2]!, 'icon', 'src') });
  }
  const programs: ParsedXmlTv['programs'] = [];
  for (const match of content.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const channelExternalId = attribute(match[1]!, 'channel');
    const startsAt = xmlTvDate(attribute(match[1]!, 'start'));
    const endsAt = xmlTvDate(attribute(match[1]!, 'stop'));
    const title = tag(match[2]!, 'title');
    if (!channelExternalId || !startsAt || !endsAt || !title || endsAt <= startsAt) continue;
    programs.push({ channelExternalId, startsAt, endsAt, title, subtitle: tag(match[2]!, 'sub-title'),
      description: tag(match[2]!, 'desc'), category: tag(match[2]!, 'category'), iconUrl: tagAttribute(match[2]!, 'icon', 'src'),
      episode: tag(match[2]!, 'episode-num') });
  }
  return { channels, programs };
}

export function normalizeLiveTvIdentity(value: string): string {
  return value.toLocaleLowerCase('da').normalize('NFKD').replace(/\p{M}/gu, '').replaceAll('æ', 'ae').replaceAll('ø', 'o').replaceAll('å', 'a').replace(/[^a-z0-9]+/g, ' ').trim();
}

function clean(value: string | undefined) { const result = value?.trim(); return result ? result : null; }
function attribute(value: string, name: string) { const match = value.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i')); return match ? decodeEntities(match[1] ?? match[2] ?? '') : null; }
function tag(value: string, name: string) { const match = value.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return match ? decodeEntities(match[1]!.replace(/<[^>]+>/g, '').trim()) || null : null; }
function tagAttribute(value: string, name: string, attr: string) { const match = value.match(new RegExp(`<${name}\\b([^>]*)\\/?\s*>`, 'i')); return match ? attribute(match[1]!, attr) : null; }
function decodeEntities(value: string) { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code))); }
function xmlTvDate(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2})|\s*Z)?/);
  if (!match) return null;
  let time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
  if (match[7]) { const offset = (Number(match[8]) * 60 + Number(match[9])) * 60_000; time += match[7] === '+' ? -offset : offset; }
  const result = new Date(time);
  return Number.isNaN(result.getTime()) ? null : result;
}
