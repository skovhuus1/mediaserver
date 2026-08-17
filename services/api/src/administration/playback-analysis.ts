export type ManualPlaybackMarker = {
  kind: 'intro' | 'recap' | 'credits';
  startMs: number;
  endMs: number;
};

export function validateManualPlaybackMarkers(markers: ManualPlaybackMarker[], durationMs: number | null) {
  const kinds = new Set<string>();
  const ordered = [...markers].sort((left, right) => left.startMs - right.startMs);
  for (const marker of ordered) {
    if (kinds.has(marker.kind)) return `Markørtypen ${marker.kind} må kun forekomme én gang.`;
    kinds.add(marker.kind);
    if (!Number.isInteger(marker.startMs) || !Number.isInteger(marker.endMs) || marker.startMs < 0 || marker.endMs <= marker.startMs) {
      return `Markøren ${marker.kind} har et ugyldigt tidsinterval.`;
    }
    if (durationMs !== null && marker.endMs > durationMs + 1_000) {
      return `Markøren ${marker.kind} ligger efter mediets varighed.`;
    }
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.startMs < previous.endMs) {
      return `Markørerne ${previous.kind} og ${current.kind} overlapper.`;
    }
  }
  return null;
}

export function playbackJobMediaId(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const mediaId = (payload as Record<string, unknown>).mediaId;
  return typeof mediaId === 'string' && mediaId ? mediaId : null;
}
