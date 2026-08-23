export type RecordingByteRange = { start: number; end: number; length: number };

export function validateRecordingWindow(startsAt: Date, endsAt: Date, now: Date) {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return 'invalid_date';
  if (endsAt <= startsAt) return 'invalid_window';
  if (endsAt <= now) return 'already_ended';
  if (endsAt.getTime() - startsAt.getTime() > 12 * 60 * 60_000) return 'too_long';
  if (startsAt.getTime() > now.getTime() + 30 * 24 * 60 * 60_000) return 'too_far_ahead';
  return null;
}

export function parseRecordingRange(header: string | undefined, size: number): RecordingByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  if (!match[1] && !match[2]) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number.parseInt(match[2]!, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}
