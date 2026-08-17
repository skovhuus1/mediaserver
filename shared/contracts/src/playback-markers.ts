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
  intervalSeconds: number;
  offsetSeconds: number;
  hashes: string[];
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
  const minimumSeconds = options.minimumSeconds ?? 30;
  const maximumStartSeconds = options.maximumStartSeconds ?? 12 * 60;
  const maximumHashDistance = options.maximumHashDistance ?? 12;
  const minimumFrames = Math.max(2, Math.ceil(minimumSeconds / primary.intervalSeconds));
  let best: { startIndex: number; length: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.intervalSeconds !== primary.intervalSeconds) continue;
    for (let left = 0; left < primary.hashes.length; left += 1) {
      const absoluteStart = primary.offsetSeconds + left * primary.intervalSeconds;
      if (absoluteStart > maximumStartSeconds) break;
      for (let right = 0; right < candidate.hashes.length; right += 1) {
        let length = 0;
        while (
          left + length < primary.hashes.length
          && right + length < candidate.hashes.length
          && hammingDistance(primary.hashes[left + length]!, candidate.hashes[right + length]!) <= maximumHashDistance
        ) length += 1;
        if (length < minimumFrames || (best && length <= best.length)) continue;
        const sequence = primary.hashes.slice(left, left + length);
        const usefulHashes = sequence.filter((hash) => !/^0+$/.test(hash));
        if (usefulHashes.length < minimumFrames || new Set(usefulHashes).size < Math.ceil(minimumFrames / 2)) continue;
        best = { startIndex: left, length };
      }
    }
  }
  if (!best) return null;
  const startMs = Math.round((primary.offsetSeconds + best.startIndex * primary.intervalSeconds) * 1_000);
  const endMs = Math.round((primary.offsetSeconds + (best.startIndex + best.length) * primary.intervalSeconds) * 1_000);
  return {
    kind: 'intro',
    startMs,
    endMs,
    source: 'automatic',
    confidence: Math.min(0.95, 0.62 + (endMs - startMs) / 900_000),
  };
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
