export const LIVE_TV_CANONICAL_KEY_PREFIX = 'channel:v2:';

export type LiveTvSourceQuality = 'uhd' | 'fhd' | 'hd' | 'standard' | 'sd';

export type LiveTvChannelDescriptor = {
  canonicalKey: string;
  displayName: string;
  qualityLabel: LiveTvSourceQuality;
  qualityRank: number;
  legacyKeys: string[];
};

type LiveTvChannelInput = {
  name: string;
  tvgName?: string | null;
  tvgId?: string | null;
};

const QUALITY_SUFFIX = '(?:4\\s*k|uhd|2160p?|full\\s*hd|fhd|fh|1080p?|hd|720p?|sd|576p?|480p?|hevc|h[ ._-]?265|h[ ._-]?264|dk|danmark|denmark|dansk)';
const TRAILING_QUALITY = new RegExp(`(?:\\s*(?:[-|:/·]+\\s*)?(?:\\[|\\()?${QUALITY_SUFFIX}(?:\\]|\\))?)+\\s*$`, 'iu');
const LEADING_LOCALE = /^(?:\s*(?:\[|\()?\s*(?:dk|danmark|denmark|dansk)\s*(?:\]|\))?\s*(?:[-|:/·]+\s*)?)+/iu;

export function describeLiveTvChannel(input: LiveTvChannelInput): LiveTvChannelDescriptor {
  const sourceName = input.tvgName?.trim() || input.name.trim() || input.tvgId?.trim() || 'Ukendt kanal';
  const displayName = canonicalLiveTvDisplayName(sourceName);
  const canonicalIdentity = normalizeCanonicalIdentity(displayName)
    || normalizeCanonicalIdentity(input.tvgId ?? '')
    || 'ukendt-kanal';
  const quality = classifyLiveTvSourceQuality(input.name, input.tvgName, input.tvgId);
  const legacyKeys = [
    input.tvgId ? `tvg:${normalizeLiveTvIdentity(input.tvgId)}` : null,
    `name:${normalizeLiveTvIdentity(input.tvgName ?? input.name)}`,
  ].filter((value): value is string => Boolean(value && !value.endsWith(':')));

  return {
    canonicalKey: `${LIVE_TV_CANONICAL_KEY_PREFIX}${canonicalIdentity}`,
    displayName,
    qualityLabel: quality.label,
    qualityRank: quality.rank,
    legacyKeys: [...new Set(legacyKeys)],
  };
}

export function canonicalLiveTvDisplayName(value: string): string {
  const original = value.trim().replace(/\s+/gu, ' ');
  let result = original;
  let previous = '';
  while (result && result !== previous) {
    previous = result;
    result = result
      .replace(LEADING_LOCALE, '')
      .replace(TRAILING_QUALITY, '')
      .replace(/[\s|:/·-]+$/gu, '')
      .trim();
  }
  return result || original || 'Ukendt kanal';
}

export function classifyLiveTvSourceQuality(...values: Array<string | null | undefined>): { label: LiveTvSourceQuality; rank: number } {
  const value = values.filter((entry): entry is string => Boolean(entry)).join(' ').toLocaleLowerCase('da');
  if (/(^|[^a-z0-9])(?:4\s*k|uhd|2160p?)(?=$|[^a-z0-9])/iu.test(value)) return { label: 'uhd', rank: 0 };
  if (/(^|[^a-z0-9])(?:full\s*hd|fhd|fh|1080p?)(?=$|[^a-z0-9])/iu.test(value)) return { label: 'fhd', rank: 10 };
  if (/(^|[^a-z0-9])(?:hd|720p?)(?=$|[^a-z0-9])/iu.test(value)) return { label: 'hd', rank: 20 };
  if (/(^|[^a-z0-9])(?:sd|576p?|480p?)(?=$|[^a-z0-9])/iu.test(value)) return { label: 'sd', rank: 40 };
  return { label: 'standard', rank: 30 };
}

export function normalizeLiveTvIdentity(value: string): string {
  return value.toLocaleLowerCase('da').normalize('NFKD').replace(/\p{M}/gu, '').replaceAll('æ', 'ae').replaceAll('ø', 'o').replaceAll('å', 'a').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function liveTvConnectionHealthRank(value: string): number {
  return value === 'healthy' ? 0 : value === 'unknown' ? 1 : 2;
}

function normalizeCanonicalIdentity(value: string): string {
  return value
    .replaceAll('+', ' plus ')
    .replaceAll('&', ' and ')
    .toLocaleLowerCase('da')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .replace(/[^a-z0-9]+/g, '');
}
