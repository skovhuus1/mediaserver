export type TimelineMarkerKind = 'intro' | 'credits';

export type TimelineMarker = {
  kind: TimelineMarkerKind;
  startMs: number;
  endMs: number;
  source: 'chapter' | 'automatic' | 'manual';
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
  version?: 1 | 2;
  intervalSeconds: number;
  offsetSeconds: number;
  hashes: string[];
  quality?: number[];
};

export type IntroDetectionReason =
  | 'detected'
  | 'chapter_marker'
  | 'insufficient_references'
  | 'low_information'
  | 'no_repeated_sequence';

export type IntroDetectionDiagnostics = {
  state: 'detected' | 'pending' | 'not-detected';
  reason: IntroDetectionReason;
  referenceCount: number;
  supportCount: number;
  usableFrameRatio: number;
  confidence: number | null;
  marker: TimelineMarker | null;
};

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
    const title = chapter.title.trim().toLocaleLowerCase('en-US');
    const kind: TimelineMarkerKind | null = /\b(intro|opening|title sequence|recap)\b/.test(title)
      ? 'intro'
      : /\b(credit|credits|end titles|closing)\b/.test(title)
        ? 'credits'
        : null;
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
  options: { minimumSeconds?: number; maximumStartSeconds?: number; maximumHashDistance?: number } = {},
): TimelineMarker | null {
  return analyzeRepeatedIntro(primary, candidates, { ...options, minimumReferences: 1 }).marker;
}

export function analyzeRepeatedIntro(
  primary: FrameFingerprint,
  candidates: readonly FrameFingerprint[],
  options: {
    minimumSeconds?: number;
    maximumStartSeconds?: number;
    maximumHashDistance?: number;
    minimumReferences?: number;
    minimumFrameQuality?: number;
  } = {},
): IntroDetectionDiagnostics {
  const minimumSeconds = options.minimumSeconds ?? 30;
  const maximumStartSeconds = options.maximumStartSeconds ?? 12 * 60;
  const maximumHashDistance = options.maximumHashDistance ?? 12;
  const minimumReferences = Math.max(1, options.minimumReferences ?? 2);
  const minimumFrameQuality = options.minimumFrameQuality ?? 0.16;
  const minimumFrames = Math.max(2, Math.ceil(minimumSeconds / primary.intervalSeconds));
  const compatible = candidates.filter((candidate) => (
    candidate.intervalSeconds === primary.intervalSeconds
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
      for (let right = 0; right < candidate.hashes.length; right += 1) {
        let length = 0;
        while (
          left + length < primary.hashes.length
          && right + length < candidate.hashes.length
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
    kind: 'intro',
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
  state: IntroDetectionDiagnostics['state'],
  reason: IntroDetectionReason,
  referenceCount: number,
  supportCount: number,
  usableFrameRatio: number,
  confidence: number | null,
  marker: TimelineMarker | null,
): IntroDetectionDiagnostics {
  return { state, reason, referenceCount, supportCount, usableFrameRatio, confidence, marker };
}
