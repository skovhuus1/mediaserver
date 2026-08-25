export function normalizePlaybackProgress(
  positionMs: number,
  durationMs?: number | null,
  explicitlyCompleted = false,
) {
  const normalizedDuration = durationMs && durationMs > 0 ? Math.min(Math.round(durationMs), 2_147_483_647) : null;
  const normalizedPosition = Math.min(
    Math.max(0, Math.round(positionMs)),
    normalizedDuration ?? 2_147_483_647,
  );
  const completed = explicitlyCompleted === true;

  return {
    positionMs: normalizedPosition,
    durationMs: normalizedDuration,
    completed,
  };
}
