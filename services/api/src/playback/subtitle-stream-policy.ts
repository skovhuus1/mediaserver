import { basename, extname } from 'node:path';

export type SubtitleDescriptor = {
  language: string;
  label: string;
  format: 'srt' | 'vtt';
  forced: boolean;
};

export type SubtitleDescriptorOptions = {
  allowLanguageOnly?: boolean;
};

const languageAliases: Record<string, { code: string; label: string }> = {
  da: { code: 'da', label: 'Dansk' },
  dan: { code: 'da', label: 'Dansk' },
  danish: { code: 'da', label: 'Dansk' },
  dansk: { code: 'da', label: 'Dansk' },
  dk: { code: 'da', label: 'Dansk' },
  en: { code: 'en', label: 'Engelsk' },
  eng: { code: 'en', label: 'Engelsk' },
  english: { code: 'en', label: 'Engelsk' },
  engelsk: { code: 'en', label: 'Engelsk' },
  de: { code: 'de', label: 'Tysk' },
  deu: { code: 'de', label: 'Tysk' },
  ger: { code: 'de', label: 'Tysk' },
  german: { code: 'de', label: 'Tysk' },
  deutsch: { code: 'de', label: 'Tysk' },
  tysk: { code: 'de', label: 'Tysk' },
  no: { code: 'no', label: 'Norsk' },
  nor: { code: 'no', label: 'Norsk' },
  norsk: { code: 'no', label: 'Norsk' },
  sv: { code: 'sv', label: 'Svensk' },
  swe: { code: 'sv', label: 'Svensk' },
  svensk: { code: 'sv', label: 'Svensk' },
  swedish: { code: 'sv', label: 'Svensk' },
  fi: { code: 'fi', label: 'Finsk' },
  fin: { code: 'fi', label: 'Finsk' },
  finnish: { code: 'fi', label: 'Finsk' },
  finsk: { code: 'fi', label: 'Finsk' },
  fr: { code: 'fr', label: 'Fransk' },
  fra: { code: 'fr', label: 'Fransk' },
  fre: { code: 'fr', label: 'Fransk' },
  french: { code: 'fr', label: 'Fransk' },
  fransk: { code: 'fr', label: 'Fransk' },
  es: { code: 'es', label: 'Spansk' },
  spa: { code: 'es', label: 'Spansk' },
  spanish: { code: 'es', label: 'Spansk' },
  spansk: { code: 'es', label: 'Spansk' },
};

const textSubtitleCodecs = new Set(['ass', 'mov_text', 'ssa', 'srt', 'subrip', 'webvtt']);

const forcedTokens = new Set(['forced', 'foreign', 'tvungen', 'forcedonly']);
const hearingImpairedTokens = new Set(['sdh', 'hi', 'cc', 'hearingimpaired', 'hoerehaemmede', 'hørehæmmede']);
const neutralSubtitleTokens = new Set([
  'sub',
  'subs',
  'subtitle',
  'subtitles',
  'undertekst',
  'undertekster',
  'default',
  'full',
  'normal',
  'complete',
  'closedcaptions',
]);

export function sidecarSubtitleDescriptor(
  videoFilename: string,
  subtitleFilename: string,
  options: SubtitleDescriptorOptions = {},
): SubtitleDescriptor | null {
  const extension = extname(subtitleFilename).toLowerCase();
  if (extension !== '.srt' && extension !== '.vtt') return null;
  const videoStem = basename(videoFilename, extname(videoFilename));
  const subtitleStem = basename(subtitleFilename, extension);
  const matchesVideo = subtitleStemMatchesVideo(videoStem, subtitleStem);
  const allTokens = subtitleTokens(subtitleStem);
  if (!matchesVideo && !(options.allowLanguageOnly && isLanguageOnlySubtitleStem(allTokens))) return null;

  const suffix = matchesVideo && subtitleStem.toLowerCase().startsWith(videoStem.toLowerCase())
    ? subtitleStem.slice(videoStem.length).replace(/^[.\s_-]+/, '')
    : subtitleStem;
  const tokens = subtitleTokens(suffix);
  const language = subtitleLanguage(tokens) ?? subtitleLanguage(allTokens);
  const forced = tokens.some((token) => forcedTokens.has(token)) || allTokens.some((token) => forcedTokens.has(token));
  const hearingImpaired =
    tokens.some((token) => hearingImpairedTokens.has(token))
    || allTokens.some((token) => hearingImpairedTokens.has(token));
  const qualifiers = [
    ...(forced ? ['tvungen'] : []),
    ...(hearingImpaired ? ['hørehæmmede'] : []),
  ];
  const baseLabel = language?.label ?? 'Undertekster';
  return {
    language: language?.code ?? 'und',
    label: qualifiers.length ? `${baseLabel} (${qualifiers.join(', ')})` : baseLabel,
    format: extension === '.srt' ? 'srt' : 'vtt',
    forced,
  };
}

export function embeddedSubtitleDescriptors(probe: unknown): Array<{
  streamIndex: number;
  language: string;
  label: string;
  forced: boolean;
}> {
  const root = asObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asObject) : [];
  return streams.flatMap((stream) => {
    if (stream.codec_type !== 'subtitle' || typeof stream.codec_name !== 'string') return [];
    if (!textSubtitleCodecs.has(stream.codec_name.toLowerCase())) return [];
    const streamIndex = finiteInteger(stream.index);
    if (streamIndex === null) return [];
    const tags = asObject(stream.tags);
    const title = typeof tags.title === 'string' && tags.title.trim() ? tags.title.trim() : null;
    const titleTokens = title ? subtitleTokens(title) : [];
    const alias = subtitleLanguage([
      ...(typeof tags.language === 'string' ? subtitleTokens(tags.language) : []),
      ...titleTokens,
    ]);
    const disposition = asObject(stream.disposition);
    const forced = disposition.forced === 1 || titleTokens.some((token) => forcedTokens.has(token));
    const hearingImpaired = disposition.hearing_impaired === 1 || titleTokens.some((token) => hearingImpairedTokens.has(token));
    const qualifiers = [
      ...(forced ? ['tvungen'] : []),
      ...(hearingImpaired ? ['hørehæmmede'] : []),
    ];
    const titleIsOnlySubtitleTags = titleTokens.length > 0 && isLanguageOnlySubtitleStem(titleTokens);
    const baseLabel = title && !titleIsOnlySubtitleTags ? title : alias?.label ?? `Undertekster ${streamIndex}`;
    return [{
      streamIndex,
      language: alias?.code ?? 'und',
      label: qualifiers.length ? `${baseLabel} (${qualifiers.join(', ')})` : baseLabel,
      forced,
    }];
  });
}

export function subtitleLanguageLabel(value: string | null | undefined) {
  return subtitleLanguage(value ? subtitleTokens(value) : []) ?? null;
}

export function subtitleToWebVtt(input: string, format: 'srt' | 'vtt'): string {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (format === 'vtt') {
    return normalized.startsWith('WEBVTT') ? `${normalized}\n` : `WEBVTT\n\n${normalized}\n`;
  }
  const cues = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})(\s+-->\s+)(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2$3$4.$5',
  );
  return `WEBVTT\n\n${cues}\n`;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function subtitleStemMatchesVideo(videoStem: string, subtitleStem: string): boolean {
  const videoLower = videoStem.toLowerCase();
  const subtitleLower = subtitleStem.toLowerCase();
  if (subtitleLower === videoLower) return true;
  if (subtitleLower.startsWith(videoLower)) {
    const next = subtitleLower.charAt(videoLower.length);
    if (!next || /[.\s_[\]()-]/.test(next)) return true;
  }
  const videoNormalized = normalizeSubtitleStem(videoStem);
  const subtitleNormalized = normalizeSubtitleStem(subtitleStem);
  return subtitleNormalized === videoNormalized
    || subtitleNormalized.startsWith(`${videoNormalized}.`);
}

function normalizeSubtitleStem(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function subtitleTokens(value: string): string[] {
  return normalizeSubtitleStem(value).split('.').filter(Boolean);
}

function subtitleLanguage(tokens: readonly string[]) {
  for (const token of tokens) {
    const alias = languageAliases[token];
    if (alias) return alias;
  }
  return null;
}

function isLanguageOnlySubtitleStem(tokens: readonly string[]): boolean {
  const semantic = tokens.filter((token) => !/^\d+$/.test(token) && !neutralSubtitleTokens.has(token));
  return semantic.length > 0
    && semantic.every((token) =>
      Boolean(languageAliases[token])
      || forcedTokens.has(token)
      || hearingImpairedTokens.has(token)
    )
    && semantic.some((token) => Boolean(languageAliases[token]));
}
