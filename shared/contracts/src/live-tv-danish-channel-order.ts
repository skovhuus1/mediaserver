import { canonicalLiveTvDisplayName, normalizeLiveTvIdentity } from './live-tv-channel.js';

export type CanalDigitalChannel = {
  number: number;
  name: string;
  aliases?: readonly string[];
};

export type DanishLiveTvPolicyInput = {
  name: string;
  tvgName?: string | null;
  tvgId?: string | null;
  groupName?: string | null;
  countryCode?: string | null;
  channelNumber?: number | null;
};

export type DanishLiveTvPolicy = {
  isDanish: boolean;
  lineupNumber: number | null;
  sortOrder: number;
};

// Canal Digital Denmark channel list, effective 20 August 2020. Numbers are
// retained as a stable default ordering, not as an availability guarantee.
export const CANAL_DIGITAL_DANMARK_CHANNELS: readonly CanalDigitalChannel[] = [
  { number: 1, name: 'DR 1', aliases: ['DR1'] },
  { number: 2, name: 'DR 2', aliases: ['DR2'] },
  { number: 3, name: 'TV 2' },
  { number: 4, name: 'Kanal 4' },
  { number: 5, name: 'Kanal 5' },
  { number: 6, name: "6'eren", aliases: ['6eren'] },
  { number: 7, name: 'TV3' },
  { number: 8, name: 'TV3+', aliases: ['TV3 Plus'] },
  { number: 9, name: 'CANAL9', aliases: ['Canal 9'] },
  { number: 10, name: 'Eurosport 2' },
  { number: 11, name: 'TV 2 Sport' },
  { number: 12, name: 'TV 2 News' },
  { number: 13, name: 'TV 2 Charlie' },
  { number: 14, name: 'TV 2 Fri' },
  { number: 15, name: 'dk4' },
  { number: 17, name: 'TV3 Puls' },
  { number: 18, name: 'TLC Danmark', aliases: ['TLC Denmark', 'TLC'] },
  { number: 19, name: 'Discovery' },
  { number: 20, name: 'TV 2 Zulu' },
  { number: 21, name: 'TV 2 Sport X' },
  { number: 23, name: 'TV3 MAX', aliases: ['TV3 Max'] },
  { number: 25, name: 'DR Ramasjang', aliases: ['Ramasjang'] },
  { number: 26, name: 'NRK1', aliases: ['NRK 1'] },
  { number: 27, name: 'SVT1', aliases: ['SVT 1'] },
  { number: 28, name: 'SVT2', aliases: ['SVT 2'] },
  { number: 29, name: 'TV4', aliases: ['TV 4'] },
  { number: 30, name: 'Nat Geo', aliases: ['National Geographic'] },
  { number: 31, name: 'Nat Geo Wild', aliases: ['National Geographic Wild'] },
  { number: 32, name: 'Animal Planet' },
  { number: 33, name: 'BBC Earth' },
  { number: 34, name: 'ID Investigation Discovery', aliases: ['Investigation Discovery', 'ID'] },
  { number: 35, name: 'HISTORY', aliases: ['History Channel'] },
  { number: 36, name: 'HISTORY 2', aliases: ['H2'] },
  { number: 37, name: 'V sport ultra' },
  { number: 38, name: 'Discovery Science' },
  { number: 42, name: 'BBC BRIT' },
  { number: 44, name: 'Paramount Network' },
  { number: 45, name: 'MTV' },
  { number: 47, name: 'VH1' },
  { number: 48, name: 'VH1 Classic' },
  { number: 60, name: 'Eurosport 1' },
  { number: 61, name: 'MOTORVISION TV', aliases: ['Motorvision'] },
  { number: 63, name: 'Sport Live' },
  { number: 64, name: 'TV3 Sport' },
  { number: 70, name: 'CNN International', aliases: ['CNN'] },
  { number: 71, name: 'BBC World News', aliases: ['BBC News'] },
  { number: 72, name: 'Sky News' },
  { number: 73, name: 'Bloomberg' },
  { number: 74, name: 'AlJazeera English', aliases: ['Al Jazeera English'] },
  { number: 76, name: 'CNBC' },
  { number: 77, name: 'DW English', aliases: ['Deutsche Welle'] },
  { number: 80, name: 'Disney Channel' },
  { number: 81, name: 'Disney XD' },
  { number: 82, name: 'Disney Junior' },
  { number: 83, name: 'Nickelodeon' },
  { number: 84, name: 'Nick Jr.' },
  { number: 85, name: 'Cartoon Network' },
  { number: 86, name: 'Boomerang' },
  { number: 87, name: 'NickToons' },
  { number: 100, name: 'C More First' },
  { number: 101, name: 'C More Series' },
  { number: 102, name: 'C More Hits' },
  { number: 104, name: 'C More Stars' },
  { number: 107, name: 'SF Kanalen' },
  { number: 110, name: 'V film premiere' },
  { number: 111, name: 'V film action' },
  { number: 112, name: 'V film hits' },
  { number: 113, name: 'V film family' },
  { number: 114, name: 'V series' },
  { number: 123, name: 'Netflix' },
  { number: 130, name: 'Kanal 5 Undertekster' },
  { number: 180, name: 'Visjon Norge' },
  { number: 181, name: 'Gospel Channel Europe' },
  { number: 182, name: 'CGTN' },
  { number: 185, name: 'Kanal 10 Norge' },
  { number: 186, name: 'CGTN Documentary' },
  { number: 193, name: 'DR P3' },
  { number: 195, name: 'Scandinavian Satellite Radio' },
  { number: 211, name: 'TV 2 / Øst', aliases: ['TV 2 Øst', 'TV2 Øst'] },
  { number: 212, name: 'TV 2 / Fyn', aliases: ['TV 2 Fyn', 'TV2 Fyn'] },
  { number: 213, name: 'TV 2 / Syd', aliases: ['TV 2 Syd', 'TV2 Syd'] },
  { number: 214, name: 'TV 2 / Østjylland', aliases: ['TV 2 Østjylland', 'TV2 Østjylland'] },
  { number: 215, name: 'TV 2 / Midt-Vest', aliases: ['TV 2 Midt-Vest', 'TV2 Midt-Vest'] },
  { number: 216, name: 'TV 2 / Nord', aliases: ['TV 2 Nord', 'TV2 Nord'] },
  { number: 217, name: 'TV 2 / Bornholm', aliases: ['TV 2 Bornholm', 'TV2 Bornholm'] },
];

const DANISH_NATIVE_NUMBERS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 20, 21, 23, 25, 63, 64, 193,
  211, 212, 213, 214, 215, 216, 217,
]);
const LINEUP_BY_KEY = new Map<string, CanalDigitalChannel>();

for (const channel of CANAL_DIGITAL_DANMARK_CHANNELS) {
  for (const name of [channel.name, ...(channel.aliases ?? [])]) LINEUP_BY_KEY.set(lineupKey(name), channel);
}

export function resolveDanishLiveTvPolicy(input: DanishLiveTvPolicyInput): DanishLiveTvPolicy {
  const sourceName = input.tvgName?.trim() || input.name;
  const lineup = LINEUP_BY_KEY.get(lineupKey(sourceName)) ?? null;
  const explicitLocale = [input.countryCode, input.groupName]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => normalizeLiveTvIdentity(value).split(' '))
    .some((token) => ['dk', 'dnk', 'danmark', 'denmark', 'dansk', 'danish'].includes(token));
  const nameCarriesLocale = /(?:^|[\s[(|/_-])(?:dk|dnk|danmark|denmark|dansk|danish)(?=$|[\s\])|/_-])/iu.test(input.name);
  const isDanish = explicitLocale || nameCarriesLocale || Boolean(lineup && DANISH_NATIVE_NUMBERS.has(lineup.number));
  const fallbackNumber = Math.min(9_999, Math.max(0, input.channelNumber ?? 9_999));
  return {
    isDanish,
    lineupNumber: lineup?.number ?? null,
    sortOrder: lineup ? lineup.number * 100 : 90_000 + fallbackNumber,
  };
}

export function canalDigitalPositionFor(name: string): number | null {
  return LINEUP_BY_KEY.get(lineupKey(name))?.number ?? null;
}

function lineupKey(value: string): string {
  return normalizeLiveTvIdentity(canonicalLiveTvDisplayName(value).replaceAll('+', ' plus ')).replaceAll(' ', '');
}
