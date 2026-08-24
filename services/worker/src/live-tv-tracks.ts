export type LiveTvTrackKind = 'audio' | 'subtitle';

export type LiveTvTrack = {
  id: string;
  kind: LiveTvTrackKind;
  streamIndex: number;
  language: string | null;
  label: string;
  codec: string;
  isDefault: boolean;
  isForced: boolean;
};

export type LiveTvTrackCatalog = { audio: LiveTvTrack[]; subtitles: LiveTvTrack[] };

type ProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  tags?: { language?: string; title?: string };
  disposition?: { default?: number; forced?: number };
};

const languageAliases: Record<string, string> = {
  dan: 'da', da: 'da', eng: 'en', en: 'en', nor: 'no', nob: 'no', nno: 'no', swe: 'sv', sv: 'sv',
  deu: 'de', ger: 'de', spa: 'es', fra: 'fr', fre: 'fr',
};

function languageName(language: string | null): string {
  if (!language) return 'Ukendt sprog';
  try { return new Intl.DisplayNames(['da'], { type: 'language' }).of(language) ?? language.toUpperCase(); }
  catch { return language.toUpperCase(); }
}

function normalizeLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toLowerCase().replace('_', '-');
  return languageAliases[normalized] ?? normalized.slice(0, 2);
}

export function parseLiveTvProbe(payload: unknown): LiveTvTrackCatalog {
  const streams = payload && typeof payload === 'object' && Array.isArray((payload as { streams?: unknown }).streams)
    ? (payload as { streams: ProbeStream[] }).streams : [];
  const catalog: LiveTvTrackCatalog = { audio: [], subtitles: [] };
  for (const stream of streams) {
    const kind: LiveTvTrackKind | null = stream.codec_type === 'audio' ? 'audio' : stream.codec_type === 'subtitle' ? 'subtitle' : null;
    if (!kind || !Number.isInteger(stream.index)) continue;
    const language = normalizeLanguage(stream.tags?.language);
    const title = stream.tags?.title?.trim();
    const isDefault = stream.disposition?.default === 1;
    const isForced = stream.disposition?.forced === 1;
    const track: LiveTvTrack = {
      id: `${kind}:${stream.index}`, kind, streamIndex: stream.index as number, language,
      label: title || `${languageName(language)}${isForced ? ' (tvungen)' : ''}`,
      codec: stream.codec_name ?? 'unknown', isDefault, isForced,
    };
    (kind === 'audio' ? catalog.audio : catalog.subtitles).push(track);
  }
  const preferred = (left: LiveTvTrack, right: LiveTvTrack) => Number(right.isDefault) - Number(left.isDefault) || left.streamIndex - right.streamIndex;
  catalog.audio.sort(preferred);
  catalog.subtitles.sort(preferred);
  return catalog;
}

export function findLiveTvTrack(catalog: LiveTvTrackCatalog, kind: LiveTvTrackKind, id: string | null | undefined): LiveTvTrack | null {
  if (!id) return null;
  return (kind === 'audio' ? catalog.audio : catalog.subtitles).find((track) => track.id === id) ?? null;
}

export function defaultAudioTrack(catalog: LiveTvTrackCatalog): LiveTvTrack | null {
  return catalog.audio.find((track) => track.isDefault) ?? catalog.audio[0] ?? null;
}

export function isBitmapSubtitle(codec: string): boolean {
  return ['dvb_subtitle', 'dvd_subtitle', 'hdmv_pgs_subtitle', 'xsub'].includes(codec.toLowerCase());
}

