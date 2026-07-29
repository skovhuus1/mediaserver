export function playbackResumeTargetSeconds(
  positionMs: number,
  durationSeconds?: number | null,
): number | null {
  const targetSeconds = Math.max(0, positionMs) / 1000;
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return targetSeconds;
  }
  return Math.min(targetSeconds, Math.max(0, durationSeconds - 0.25));
}
