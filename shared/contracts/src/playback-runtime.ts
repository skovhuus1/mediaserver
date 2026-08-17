export type PlaybackSubtitleCandidate = {
  id: string;
  language: string;
  label: string;
  delivery: 'webvtt' | 'burn_in';
};

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
    const match = candidates.find((track) => normalizedLanguage(track.language) === preferred);
    if (match) return match.id;
  }
  return mode === 'always' || mode === 'forced' ? candidates[0]?.id ?? null : null;
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
