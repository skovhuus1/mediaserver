export type TimelineMarkerKind = 'intro' | 'recap' | 'credits';

export const playbackMarkerAnalysisVersion = 3;

export type TimelineMarker = {
  kind: TimelineMarkerKind;
  startMs: number;
  endMs: number;
  source: 'chapter' | 'automatic' | 'external' | 'manual';
  confidence: number | null;
};

export type TrickplayCue = {
  startMs: number;
  endMs: number;
  sheet: number;
  column: number;
  row: number;
};

export type FrameFingerprint = {
  version?: 1 | 2 | 3;
  intervalSeconds: number;
  offsetSeconds: number;
  hashes: string[];
  quality?: number[];
};

export type MarkerDetectionKind = Extract<TimelineMarkerKind, 'intro' | 'recap'>;

export type MarkerDetectionReason =
  | 'detected'
  | 'external_provider'
  | 'chapter_marker'
  | 'insufficient_references'
  | 'low_information'
  | 'no_repeated_sequence';

export type MarkerDetectionDiagnostics = {
  state: 'detected' | 'pending' | 'not-detected';
  reason: MarkerDetectionReason;
  referenceCount: number;
  supportCount: number;
  usableFrameRatio: number;
  confidence: number | null;
  marker: TimelineMarker | null;
};

export type IntroDetectionReason = MarkerDetectionReason;
export type IntroDetectionDiagnostics = MarkerDetectionDiagnostics;

export type MediaChapter = {
  title: string;
  startMs: number;
  endMs: number;
};

export function buildTrickplayCues(input: {
  durationMs: number;
  intervalSeconds: number;
  columns?: number;
  rows?: number;
}): TrickplayCue[] {
  const durationMs = Math.max(1, Math.round(input.durationMs));
  const intervalMs = Math.max(1_000, Math.round(input.intervalSeconds * 1_000));
  const columns = Math.max(1, Math.round(input.columns ?? 5));
  const rows = Math.max(1, Math.round(input.rows ?? 5));
  const capacity = columns * rows;
  const frameCount = Math.max(1, Math.ceil(durationMs / intervalMs));
  return Array.from({ length: frameCount }, (_, index) => ({
    startMs: index * intervalMs,
    endMs: Math.min(durationMs, (index + 1) * intervalMs),
    sheet: Math.floor(index / capacity),
    column: index % columns,
    row: Math.floor((index % capacity) / columns),
  }));
}

export function chapterTimelineMarkers(chapters: readonly MediaChapter[], durationMs: number): TimelineMarker[] {
  const result: TimelineMarker[] = [];
  const normalizedDuration = Math.max(0, durationMs);
  for (const chapter of chapters) {
    const kind = chapterMarkerKind(chapter.title);
    if (!kind || result.some((marker) => marker.kind === kind)) continue;
    const startMs = Math.max(0, Math.round(chapter.startMs));
    const endMs = Math.min(normalizedDuration || chapter.endMs, Math.max(startMs + 1_000, Math.round(chapter.endMs)));
    if (endMs <= startMs) continue;
    result.push({ kind, startMs, endMs, source: 'chapter', confidence: 1 });
  }
  return result;
}

export function detectRepeatedIntro(
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: RepeatedSegmentOptions = {},
): TimelineMarker | null {
  return analyzeRepeatedIntro(primary, candidates, { ...options, minimumReferences: 1 }).marker;
}

export function analyzeRepeatedIntro(
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: RepeatedSegmentOptions = {},
): MarkerDetectionDiagnostics {
  return analyzeRepeatedSegment('intro', primary, candidates, options);
}

export function detectRepeatedRecap(
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: RepeatedSegmentOptions = {},
): TimelineMarker | null {
  return analyzeRepeatedRecap(primary, candidates, { ...options, minimumReferences: 1 }).marker;
}

export function analyzeRepeatedRecap(
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: RepeatedSegmentOptions = {},
): MarkerDetectionDiagnostics {
  return analyzeRepeatedSegment('recap', primary, candidates, {
    minimumSeconds: 20,
    maximumStartSeconds: 4 * 60,
    maximumEndSeconds: 4 * 60,
    ...options,
  });
}

export type RepeatedSegmentOptions = {
  minimumSeconds?: number;
  minimumStartSeconds?: number;
  maximumStartSeconds?: number;
  maximumEndSeconds?: number;
  maximumHashDistance?: number;
  minimumReferences?: number;
  minimumFrameQuality?: number;
};

function analyzeRepeatedSegment(
  kind: MarkerDetectionKind,
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: RepeatedSegmentOptions,
): MarkerDetectionDiagnostics {
  const minimumSeconds = options.minimumSeconds ?? 30;
  const minimumStartSeconds = options.minimumStartSeconds ?? 0;
  const maximumStartSeconds = options.maximumStartSeconds ?? 12 * 60;
  const maximumEndSeconds = options.maximumEndSeconds ?? Number.POSITIVE_INFINITY;
  const maximumHashDistance = options.maximumHashDistance ?? 12;
  const minimumReferences = Math.max(1, options.minimumReferences ?? 2);
  const minimumFrameQuality = options.minimumFrameQuality ?? 0.16;
  const minimumFrames = Math.max(2, Math.ceil(minimumSeconds / primary.intervalSeconds));
  const compatible = candidates.filter((candidate) => (
    (candidate.version ?? 1) === (primary.version ?? 1)
    && candidate.intervalSeconds === primary.intervalSeconds
    && candidate.offsetSeconds === primary.offsetSeconds
    && candidate.hashes.length >= minimumFrames
  ));
  const usableFrames = primary.hashes.filter((_, index) => frameIsUsable(primary, index, minimumFrameQuality)).length;
  const usableFrameRatio = primary.hashes.length ? usableFrames / primary.hashes.length : 0;
  if (compatible.length < minimumReferences) {
    return diagnostics('pending', 'insufficient_references', compatible.length, 0, usableFrameRatio, null, null);
  }
  if (usableFrames < minimumFrames || usableFrameRatio < 0.2) {
    return diagnostics('not-detected', 'low_information', compatible.length, 0, usableFrameRatio, null, null);
  }

  const matches: Array<{ startIndex: number; length: number }> = [];
  for (const candidate of compatible) {
    let candidateBest: { startIndex: number; length: number } | null = null;
    for (let left = 0; left < primary.hashes.length; left += 1) {
      const absoluteStart = primary.offsetSeconds + left * primary.intervalSeconds;
      if (absoluteStart > maximumStartSeconds) break;
      if (absoluteStart < minimumStartSeconds) continue;
      for (let right = 0; right < candidate.hashes.length; right += 1) {
        let length = 0;
        while (
          left + length < primary.hashes.length
          && right + length < candidate.hashes.length
          && primary.offsetSeconds + (left + length) * primary.intervalSeconds <= maximumEndSeconds
          && frameIsUsable(primary, left + length, minimumFrameQuality)
          && frameIsUsable(candidate, right + length, minimumFrameQuality)
          && hammingDistance(primary.hashes[left + length]!, candidate.hashes[right + length]!) <= maximumHashDistance
        ) length += 1;
        if (length < minimumFrames || (candidateBest && length <= candidateBest.length)) continue;
        const sequence = primary.hashes.slice(left, left + length);
        const usefulHashes = sequence.filter((hash) => !/^0+$/.test(hash));
        if (usefulHashes.length < minimumFrames || new Set(usefulHashes).size < Math.ceil(minimumFrames / 2)) continue;
        candidateBest = { startIndex: left, length };
      }
    }
    if (candidateBest) matches.push(candidateBest);
  }

  let consensus: { matches: Array<{ startIndex: number; length: number }> } | null = null;
  const startToleranceFrames = Math.max(2, Math.ceil(15 / primary.intervalSeconds));
  for (const anchor of matches) {
    const supporting = matches.filter((match) => (
      Math.abs(match.startIndex - anchor.startIndex) <= startToleranceFrames
      && Math.min(match.startIndex + match.length, anchor.startIndex + anchor.length)
        - Math.max(match.startIndex, anchor.startIndex) >= minimumFrames
    ));
    if (!consensus || supporting.length > consensus.matches.length) consensus = { matches: supporting };
  }
  const supportCount = consensus?.matches.length ?? 0;
  if (!consensus || supportCount < minimumReferences) {
    return diagnostics('not-detected', 'no_repeated_sequence', compatible.length, supportCount, usableFrameRatio, null, null);
  }

  const startIndex = median(consensus.matches.map((match) => match.startIndex));
  const endIndex = median(consensus.matches.map((match) => match.startIndex + match.length));
  const startMs = Math.round((primary.offsetSeconds + startIndex * primary.intervalSeconds) * 1_000);
  const endMs = Math.round((primary.offsetSeconds + endIndex * primary.intervalSeconds) * 1_000);
  const supportRatio = supportCount / compatible.length;
  const durationScore = Math.min(0.1, (endMs - startMs) / 900_000);
  const confidence = Math.min(0.98, 0.66 + supportRatio * 0.16 + durationScore + Math.min(0.06, usableFrameRatio * 0.06));
  const marker: TimelineMarker = {
    kind,
    startMs,
    endMs,
    source: 'automatic',
    confidence,
  };
  return diagnostics('detected', 'detected', compatible.length, supportCount, usableFrameRatio, confidence, marker);
}

export function creditsMarkerFromBlackSegments(
  segments: readonly { startMs: number; endMs: number }[],
  durationMs: number,
): TimelineMarker | null {
  const earliest = Math.max(0, durationMs - 12 * 60_000);
  const latest = Math.max(0, durationMs - 45_000);
  const candidate = segments
    .filter((segment) => segment.startMs >= earliest && segment.startMs <= latest && segment.endMs < durationMs - 30_000)
    .sort((left, right) => left.startMs - right.startMs)[0];
  if (!candidate) return null;
  return {
    kind: 'credits',
    startMs: Math.max(candidate.startMs, candidate.endMs),
    endMs: durationMs,
    source: 'automatic',
    confidence: 0.58,
  };
}

const recapChapterPhrases = [
  'recap',
  'previously',
  'previously on',
  'previous episode',
  'last episode',
  'last time',
  'resume',
  'recapitulation',
  'tidligere',
  'sidst',
  'sidste gang',
  'forrige afsnit',
];

const introChapterPhrases = [
  'intro',
  'opening',
  'opening credits',
  'title sequence',
  'main titles',
  'theme song',
  'opener',
  'abning',
  'titel sekvens',
  'titelsekvens',
];

const creditsChapterPhrases = [
  'credit',
  'credits',
  'end credits',
  'end titles',
  'closing',
  'closing credits',
  'rulletekst',
  'rulletekster',
  'sluttekster',
];

function chapterMarkerKind(value: string): TimelineMarkerKind | null {
  const title = value.trim().toLocaleLowerCase('en-US').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!title) return null;
  if (hasChapterPhrase(title, recapChapterPhrases)) return 'recap';
  if (hasChapterPhrase(title, introChapterPhrases)) return 'intro';
  if (hasChapterPhrase(title, creditsChapterPhrases)) return 'credits';
  return null;
}

function hasChapterPhrase(title: string, phrases: readonly string[]) {
  return phrases.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(title);
  });
}

function hammingDistance(left: string, right: string): number {
  try {
    let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
    let count = 0;
    while (value) {
      value &= value - 1n;
      count += 1;
    }
    return count;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function frameIsUsable(fingerprint: FrameFingerprint, index: number, minimumQuality: number) {
  const hash = fingerprint.hashes[index];
  if (!hash || /^0+$/.test(hash) || /^f+$/i.test(hash)) return false;
  const quality = fingerprint.quality?.[index];
  return quality === undefined || (Number.isFinite(quality) && quality >= minimumQuality);
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function diagnostics(
  state: MarkerDetectionDiagnostics['state'],
  reason: MarkerDetectionReason,
  referenceCount: number,
  supportCount: number,
  usableFrameRatio: number,
  confidence: number | null,
  marker: TimelineMarker | null,
): MarkerDetectionDiagnostics {
  return { state, reason, referenceCount, supportCount, usableFrameRatio, confidence, marker };
}
