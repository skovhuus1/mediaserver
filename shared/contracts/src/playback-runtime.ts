export type PlaybackSubtitleCandidate = {
  id: string;
  language: string;
  label: string;
  delivery: 'webvtt' | 'burn_in';
};

export type ParsedWebVttCue = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  text: string;
};

export function parseWebVttCues(input: string): ParsedWebVttCue[] {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: ParsedWebVttCue[] = [];

  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n').map((line) => line.trimEnd());
    const firstLine = lines.find((line) => line.trim())?.trim() ?? '';
    if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/i.test(firstLine)) continue;

    const timingLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingLineIndex < 0) continue;
    const timing = lines[timingLineIndex]?.match(
      /^\s*((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?\s*$/,
    );
    if (!timing) continue;

    const startTimestamp = timing[1];
    const endTimestamp = timing[2];
    if (!startTimestamp || !endTimestamp) continue;

    const startTimeSeconds = parseWebVttTimestamp(startTimestamp);
    const endTimeSeconds = parseWebVttTimestamp(endTimestamp);
    const text = decodeWebVttText(lines.slice(timingLineIndex + 1).join('\n'));
    if (startTimeSeconds === null || endTimeSeconds === null || endTimeSeconds <= startTimeSeconds || !text) continue;
    cues.push({ startTimeSeconds, endTimeSeconds, text });
  }

  return cues.sort((left, right) => left.startTimeSeconds - right.startTimeSeconds);
}

export function webVttCueTextAt(
  cues: readonly ParsedWebVttCue[],
  mediaTimeSeconds: number,
  offsetMs = 0,
): string {
  const subtitleTimeSeconds = mediaTimeSeconds - offsetMs / 1_000;
  return cues
    .filter((cue) => cue.startTimeSeconds <= subtitleTimeSeconds && cue.endTimeSeconds > subtitleTimeSeconds)
    .map((cue) => cue.text)
    .join('\n');
}

function parseWebVttTimestamp(value: string): number | null {
  const parts = value.replace(',', '.').split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const seconds = Number(parts[parts.length - 1]);
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite) || seconds >= 60 || minutes >= 60) return null;
  return hours * 3_600 + minutes * 60 + seconds;
}

function decodeWebVttText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|nbsp|lrm|rlm);|&#(?:\d+|x[\da-f]+);/gi, (entity) => decodeWebVttEntity(entity))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function decodeWebVttEntity(entity: string): string {
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': '\u00A0',
    '&lrm;': '\u200E',
    '&rlm;': '\u200F',
  };
  const lower = entity.toLowerCase();
  if (lower in named) return named[lower] ?? entity;
  const hexadecimal = /^&#x([\da-f]+);$/i.exec(entity);
  const decimal = /^&#(\d+);$/.exec(entity);
  const codePoint = hexadecimal
    ? Number.parseInt(hexadecimal[1] ?? '', 16)
    : decimal ? Number.parseInt(decimal[1] ?? '', 10) : NaN;
  try {
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  } catch {
    return entity;
  }
}

const languageAliases: Record<string, string> = {
  dan: 'da',
  eng: 'en',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  dut: 'nl',
  nld: 'nl',
  nor: 'no',
  swe: 'sv',
  spa: 'es',
  fin: 'fi',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
};

function normalizedLanguage(language: string): string {
  const code = language.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return languageAliases[code] ?? code;
}

export function chooseDefaultWebVttSubtitle(
  tracks: PlaybackSubtitleCandidate[],
  preferredLanguages: string[],
  mode: 'auto' | 'always' | 'forced' | 'off',
): string | null {
  if (mode === 'off') return null;
  const candidates = tracks.filter((track) =>
    track.delivery === 'webvtt'
    && (mode !== 'forced' || /forced|tvungen/i.test(track.label)),
  );
  for (const language of preferredLanguages) {
    const preferred = normalizedLanguage(language);
    const match = candidates
      .filter((track) => normalizedLanguage(track.language) === preferred)
      .sort((left, right) => subtitlePreferenceRank(left, mode) - subtitlePreferenceRank(right, mode))[0];
    if (match) return match.id;
  }
  return mode === 'always' || mode === 'forced'
    ? [...candidates].sort((left, right) => subtitlePreferenceRank(left, mode) - subtitlePreferenceRank(right, mode))[0]?.id ?? null
    : null;
}

function subtitlePreferenceRank(
  track: PlaybackSubtitleCandidate,
  mode: 'auto' | 'always' | 'forced' | 'off',
): number {
  if (mode === 'forced') return 0;
  if (/forced|tvungen/i.test(track.label)) return 2;
  if (/sdh|hearing|h.reh.mmede/i.test(track.label)) return 1;
  return 0;
}

export function deferredUpscaleLevelCap(
  levels: Array<{ height: number; upscaled: boolean }>,
  sourceHeight: number | null,
  allowUpscale: boolean,
): number {
  if (!allowUpscale || !levels.some((level) => level.upscaled)) return -1;
  const ceiling = sourceHeight ?? Number.MAX_SAFE_INTEGER;
  return levels.reduce(
    (cap, level, index) => !level.upscaled && level.height <= ceiling ? index : cap,
    -1,
  );
}
