export type TimelineMarkerKind = 'intro' | 'recap' | 'credits';

export const playbackMarkerAnalysisVersion = 6;

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
  version?: 1 | 2 | 3 | 4;
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
  | 'manual_marker'
  | 'previous_episode_match'
  | 'no_intro_boundary'
  | 'insufficient_previous_episodes'
  | 'credits_tail_detected'
  | 'marker_missing'
  | 'explicit_evidence_required'
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
  source?: TimelineMarker['source'] | null;
  analysisVersion?: number;
  analyzedAt?: string;
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
  minimumConfidence?: number;
  maximumGapFrames?: number;
  temporalToleranceFrames?: number;
  minimumSequenceMatchRatio?: number;
};

type RepeatedSegmentMatch = {
  startIndex: number;
  length: number;
  matchRatio: number;
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
  const minimumConfidence = options.minimumConfidence ?? 0;
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

  const maximumGapFrames = Math.max(0, options.maximumGapFrames ?? 1);
  const temporalToleranceFrames = Math.max(0, options.temporalToleranceFrames ?? 1);
  const minimumSequenceMatchRatio = Math.min(1, Math.max(0.5, options.minimumSequenceMatchRatio ?? 0.72));
  const matches: RepeatedSegmentMatch[] = [];
  for (const candidate of compatible) {
    const candidateBest = bestAlignedSequence(primary, candidate, {
      maximumEndSeconds,
      maximumGapFrames,
      maximumHashDistance,
      maximumStartSeconds,
      minimumFrameQuality,
      minimumFrames,
      minimumSequenceMatchRatio,
      minimumStartSeconds,
      temporalToleranceFrames,
    });
    if (candidateBest) matches.push(candidateBest);
  }

  let consensus: { matches: RepeatedSegmentMatch[] } | null = null;
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
  const alignmentQuality = median(consensus.matches.map((match) => match.matchRatio));
  const durationScore = Math.min(0.1, (endMs - startMs) / 900_000);
  const confidence = Math.min(
    0.98,
    0.66
      + supportRatio * 0.14
      + alignmentQuality * 0.08
      + durationScore
      + Math.min(0.05, usableFrameRatio * 0.05),
  );
  if (confidence < minimumConfidence) {
    return diagnostics('not-detected', 'no_repeated_sequence', compatible.length, supportCount, usableFrameRatio, null, null);
  }
  const marker: TimelineMarker = {
    kind,
    startMs,
    endMs,
    source: 'automatic',
    confidence,
  };
  return diagnostics('detected', 'detected', compatible.length, supportCount, usableFrameRatio, confidence, marker);
}

function bestAlignedSequence(
  primary: FrameFingerprint,
  candidate: FrameFingerprint,
  options: {
    maximumEndSeconds: number;
    maximumGapFrames: number;
    maximumHashDistance: number;
    maximumStartSeconds: number;
    minimumFrameQuality: number;
    minimumFrames: number;
    minimumSequenceMatchRatio: number;
    minimumStartSeconds: number;
    temporalToleranceFrames: number;
  },
): RepeatedSegmentMatch | null {
  const minimumPrimaryIndex = Math.max(0, Math.ceil((options.minimumStartSeconds - primary.offsetSeconds) / primary.intervalSeconds));
  const maximumPrimaryIndex = Math.min(
    primary.hashes.length - 1,
    Math.floor((options.maximumEndSeconds - primary.offsetSeconds) / primary.intervalSeconds),
  );
  let best: RepeatedSegmentMatch | null = null;
  const firstOffset = -(maximumPrimaryIndex);
  const lastOffset = candidate.hashes.length - 1 - minimumPrimaryIndex;

  for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
    let runStart: number | null = null;
    let lastMatch: number | null = null;
    let lastCandidateMatch = -1;
    let matchedIndexes: number[] = [];

    const finishRun = () => {
      if (runStart === null || lastMatch === null) return;
      const length = lastMatch - runStart + 1;
      const matchRatio = matchedIndexes.length / length;
      const usefulHashes = matchedIndexes.map((index) => primary.hashes[index]!).filter((hash) => !/^0+$/.test(hash));
      const diverseEnough = new Set(usefulHashes).size >= Math.ceil(options.minimumFrames / 2);
      if (
        length >= options.minimumFrames
        && matchedIndexes.length >= options.minimumFrames
        && matchRatio >= options.minimumSequenceMatchRatio
        && diverseEnough
        && (!best || length > best.length || (length === best.length && matchRatio > best.matchRatio))
      ) best = { startIndex: runStart, length, matchRatio };
    };

    for (let left = minimumPrimaryIndex; left <= maximumPrimaryIndex; left += 1) {
      const absoluteStart = primary.offsetSeconds + left * primary.intervalSeconds;
      if (absoluteStart > options.maximumStartSeconds && runStart === null) break;
      const expectedRight = left + offset;
      const rightStart = Math.max(0, expectedRight - options.temporalToleranceFrames, lastCandidateMatch + 1);
      const rightEnd = Math.min(candidate.hashes.length - 1, expectedRight + options.temporalToleranceFrames);
      let matchedRight: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      if (frameIsUsable(primary, left, options.minimumFrameQuality)) {
        for (let right = rightStart; right <= rightEnd; right += 1) {
          if (!frameIsUsable(candidate, right, options.minimumFrameQuality)) continue;
          const distance = hammingDistance(primary.hashes[left]!, candidate.hashes[right]!);
          if (distance <= options.maximumHashDistance && distance < bestDistance) {
            matchedRight = right;
            bestDistance = distance;
          }
        }
      }
      if (matchedRight !== null) {
        if (runStart === null) runStart = left;
        lastMatch = left;
        lastCandidateMatch = matchedRight;
        matchedIndexes.push(left);
        continue;
      }
      if (runStart !== null && lastMatch !== null && left - lastMatch > options.maximumGapFrames) {
        finishRun();
        runStart = null;
        lastMatch = null;
        lastCandidateMatch = -1;
        matchedIndexes = [];
      }
    }
    finishRun();
  }
  return best;
}

export function analyzePreviousEpisodeRecap(
  opening: FrameFingerprint,
  previousEpisodes: readonly FrameFingerprint[],
  intro: TimelineMarker | null,
  options: {
    maximumHashDistance?: number;
    minimumFrameQuality?: number;
    minimumMatchedFrames?: number;
    minimumSupportRatio?: number;
    minimumConfidence?: number;
  } = {},
): MarkerDetectionDiagnostics {
  const introStartMs = intro?.kind === 'intro' ? intro.startMs : 0;
  const candidateEndMs = Math.min(introStartMs, 240_000);
  const usableOpening = opening.hashes.filter((_, index) => frameIsUsable(opening, index, options.minimumFrameQuality ?? 0.16)).length;
  const usableFrameRatio = opening.hashes.length ? usableOpening / opening.hashes.length : 0;
  if (candidateEndMs < 20_000) {
    return diagnostics('not-detected', 'no_intro_boundary', previousEpisodes.length, 0, usableFrameRatio, null, null);
  }
  const references = previousEpisodes.filter((candidate) => candidate.hashes.length > 0);
  if (!references.length) {
    return diagnostics('pending', 'insufficient_previous_episodes', 0, 0, usableFrameRatio, null, null);
  }
  const maximumHashDistance = options.maximumHashDistance ?? 10;
  const minimumFrameQuality = options.minimumFrameQuality ?? 0.16;
  const candidateIndexes = opening.hashes.flatMap((_, index) => {
    const frameMs = (opening.offsetSeconds + index * opening.intervalSeconds) * 1_000;
    return frameMs < candidateEndMs && frameIsUsable(opening, index, minimumFrameQuality) ? [index] : [];
  });
  const matchedIndexes = candidateIndexes.filter((index) => references.some((reference) => reference.hashes.some((_, referenceIndex) => (
    frameIsUsable(reference, referenceIndex, minimumFrameQuality)
    && hammingDistance(opening.hashes[index]!, reference.hashes[referenceIndex]!) <= maximumHashDistance
  ))));
  const minimumMatchedFrames = options.minimumMatchedFrames ?? 3;
  const supportRatio = candidateIndexes.length ? matchedIndexes.length / candidateIndexes.length : 0;
  const firstMatchedMs = matchedIndexes.length
    ? Math.round((opening.offsetSeconds + matchedIndexes[0]! * opening.intervalSeconds) * 1_000)
    : Number.POSITIVE_INFINITY;
  if (
    firstMatchedMs > 5_000
    || matchedIndexes.length < minimumMatchedFrames
    || supportRatio < (options.minimumSupportRatio ?? 0.25)
  ) {
    return diagnostics('not-detected', 'no_repeated_sequence', references.length, matchedIndexes.length, usableFrameRatio, null, null);
  }
  const confidence = Math.min(0.98, 0.79 + supportRatio * 0.2 + Math.min(0.08, matchedIndexes.length / 25 * 0.08));
  if (confidence < (options.minimumConfidence ?? 0.85)) {
    return diagnostics('not-detected', 'no_repeated_sequence', references.length, matchedIndexes.length, usableFrameRatio, null, null);
  }
  const marker: TimelineMarker = {
    kind: 'recap',
    startMs: 0,
    endMs: candidateEndMs,
    source: 'automatic',
    confidence,
  };
  return diagnostics('detected', 'previous_episode_match', references.length, matchedIndexes.length, usableFrameRatio, confidence, marker);
}

export type CreditsTailSample = {
  atMs: number;
  luma: number;
  motion: number;
  edgeDensity: number;
};

export function creditsMarkerFromTailEvidence(
  samples: readonly CreditsTailSample[],
  blackSegments: readonly { startMs: number; endMs: number }[],
  durationMs: number,
): TimelineMarker | null {
  const earliest = Math.max(Math.round(durationMs * 0.7), durationMs - 12 * 60_000);
  const eligible = samples.filter((sample) => sample.atMs >= earliest && sample.atMs <= durationMs);
  let runStart: number | null = null;
  let runLast: number | null = null;
  let bestStart: number | null = null;
  for (const sample of eligible) {
    const creditLike = sample.edgeDensity >= 0.12 && sample.motion <= 0.35 && sample.luma <= 0.86;
    if (creditLike) {
      if (runStart === null || (runLast !== null && sample.atMs - runLast > 6_000)) runStart = sample.atMs;
      runLast = sample.atMs;
      if (runLast - runStart >= 30_000 && runLast >= durationMs - 90_000) bestStart = runStart;
    } else if (runLast !== null && sample.atMs - runLast > 6_000) {
      runStart = null;
      runLast = null;
    }
  }
  const blackMarker = creditsMarkerFromBlackSegments(blackSegments, durationMs);
  if (bestStart === null) return blackMarker;
  return {
    kind: 'credits',
    startMs: blackMarker ? Math.min(bestStart, blackMarker.startMs) : bestStart,
    endMs: durationMs,
    source: 'automatic',
    confidence: blackMarker ? 0.82 : 0.72,
  };
}

export function creditsMarkerFromBlackSegments(
  segments: readonly { startMs: number; endMs: number }[],
  durationMs: number,
): TimelineMarker | null {
  const earliest = Math.max(Math.round(durationMs * 0.7), durationMs - 12 * 60_000);
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
  return { state, reason, referenceCount, supportCount, usableFrameRatio, confidence, marker, source: marker?.source ?? null };
}
