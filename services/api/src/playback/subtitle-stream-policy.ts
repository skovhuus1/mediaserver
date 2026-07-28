import { basename, extname } from 'node:path';

export type SubtitleDescriptor = {
  language: string;
  label: string;
  format: 'srt' | 'vtt';
};

const languageAliases: Record<string, { code: string; label: string }> = {
  da: { code: 'da', label: 'Dansk' },
  dan: { code: 'da', label: 'Dansk' },
  dk: { code: 'da', label: 'Dansk' },
  en: { code: 'en', label: 'Engelsk' },
  eng: { code: 'en', label: 'Engelsk' },
  de: { code: 'de', label: 'Tysk' },
  deu: { code: 'de', label: 'Tysk' },
  ger: { code: 'de', label: 'Tysk' },
  no: { code: 'no', label: 'Norsk' },
  nor: { code: 'no', label: 'Norsk' },
  sv: { code: 'sv', label: 'Svensk' },
  swe: { code: 'sv', label: 'Svensk' },
  fi: { code: 'fi', label: 'Finsk' },
  fin: { code: 'fi', label: 'Finsk' },
  fr: { code: 'fr', label: 'Fransk' },
  fra: { code: 'fr', label: 'Fransk' },
  fre: { code: 'fr', label: 'Fransk' },
  es: { code: 'es', label: 'Spansk' },
  spa: { code: 'es', label: 'Spansk' },
};

const textSubtitleCodecs = new Set(['ass', 'mov_text', 'ssa', 'srt', 'subrip', 'webvtt']);

export function sidecarSubtitleDescriptor(videoFilename: string, subtitleFilename: string): SubtitleDescriptor | null {
  const extension = extname(subtitleFilename).toLowerCase();
  if (extension !== '.srt' && extension !== '.vtt') return null;
  const videoStem = basename(videoFilename, extname(videoFilename));
  const subtitleStem = basename(subtitleFilename, extension);
  const videoLower = videoStem.toLowerCase();
  const subtitleLower = subtitleStem.toLowerCase();
  if (subtitleLower !== videoLower && !subtitleLower.startsWith(`${videoLower}.`)) return null;

  const suffix = subtitleStem.slice(videoStem.length).replace(/^\./, '');
  const tokens = suffix.toLowerCase().split('.').filter(Boolean);
  const language = tokens.map((token) => languageAliases[token]).find(Boolean);
  const forced = tokens.includes('forced') || tokens.includes('foreign');
  const hearingImpaired = tokens.includes('sdh') || tokens.includes('hi');
  const qualifiers = [
    ...(forced ? ['tvungen'] : []),
    ...(hearingImpaired ? ['hørehæmmede'] : []),
  ];
  const baseLabel = language?.label ?? 'Undertekster';
  return {
    language: language?.code ?? 'und',
    label: qualifiers.length ? `${baseLabel} (${qualifiers.join(', ')})` : baseLabel,
    format: extension === '.srt' ? 'srt' : 'vtt',
  };
}

export function embeddedSubtitleDescriptors(probe: unknown): Array<{
  streamIndex: number;
  language: string;
  label: string;
}> {
  const root = asObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asObject) : [];
  return streams.flatMap((stream) => {
    if (stream.codec_type !== 'subtitle' || typeof stream.codec_name !== 'string') return [];
    if (!textSubtitleCodecs.has(stream.codec_name.toLowerCase())) return [];
    const streamIndex = finiteInteger(stream.index);
    if (streamIndex === null) return [];
    const tags = asObject(stream.tags);
    const alias = typeof tags.language === 'string'
      ? languageAliases[tags.language.toLowerCase()]
      : undefined;
    const title = typeof tags.title === 'string' && tags.title.trim() ? tags.title.trim() : null;
    const disposition = asObject(stream.disposition);
    const forced = disposition.forced === 1;
    const hearingImpaired = disposition.hearing_impaired === 1;
    const qualifiers = [
      ...(forced ? ['tvungen'] : []),
      ...(hearingImpaired ? ['hørehæmmede'] : []),
    ];
    const baseLabel = title ?? alias?.label ?? `Undertekster ${streamIndex}`;
    return [{
      streamIndex,
      language: alias?.code ?? 'und',
      label: qualifiers.length ? `${baseLabel} (${qualifiers.join(', ')})` : baseLabel,
    }];
  });
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
