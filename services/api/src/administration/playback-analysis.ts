import { playbackMarkerAnalysisVersion } from '@boltbytes/contracts';

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

export type PlaybackIntroAnalysis = {
  state: 'detected' | 'pending' | 'not-detected';
  reason: 'detected' | 'external_provider' | 'chapter_marker' | 'manual_marker' | 'previous_episode_match' | 'no_intro_boundary' | 'insufficient_previous_episodes' | 'credits_tail_detected' | 'marker_missing' | 'explicit_evidence_required' | 'insufficient_references' | 'low_information' | 'no_repeated_sequence';
  referenceCount: number;
  supportCount: number;
  usableFrameRatio: number;
  confidence: number | null;
  source: 'chapter' | 'automatic' | 'external' | 'manual' | null;
  analysisVersion: number;
  analyzedAt: string | null;
};

export type PlaybackMarkerAnalysis = {
  intro: PlaybackIntroAnalysis | null;
  recap: PlaybackIntroAnalysis | null;
  credits: PlaybackIntroAnalysis | null;
};

export function playbackMarkerAnalysis(manifest: unknown, markers: Array<{ kind: string; source: string; confidence: number | null }> = []): PlaybackMarkerAnalysis {
  return {
    intro: playbackAnalysisForKind(manifest, 'intro', markers),
    recap: playbackAnalysisForKind(manifest, 'recap', markers),
    credits: playbackAnalysisForKind(manifest, 'credits', markers),
  };
}

export function playbackIntroAnalysis(manifest: unknown, markers: Array<{ kind: string; source: string; confidence: number | null }> = []): PlaybackIntroAnalysis | null {
  return playbackAnalysisForKind(manifest, 'intro', markers);
}

function playbackAnalysisForKind(manifest: unknown, kind: 'intro' | 'recap' | 'credits', markers: Array<{ kind: string; source: string; confidence: number | null }>): PlaybackIntroAnalysis | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  const analysis = (manifest as Record<string, unknown>).analysis;
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return null;
  const root = analysis as Record<string, unknown>;
  if (finiteNumber(root.markerAnalysisVersion) < playbackMarkerAnalysisVersion) return null;
  const markerAnalysis = root[kind];
  if (!markerAnalysis || typeof markerAnalysis !== 'object' || Array.isArray(markerAnalysis)) return null;
  const value = markerAnalysis as Record<string, unknown>;
  const states = ['detected', 'pending', 'not-detected'];
  const reasons = ['detected', 'external_provider', 'chapter_marker', 'manual_marker', 'previous_episode_match', 'no_intro_boundary', 'insufficient_previous_episodes', 'credits_tail_detected', 'marker_missing', 'explicit_evidence_required', 'insufficient_references', 'low_information', 'no_repeated_sequence'];
  if (!states.includes(String(value.state)) || !reasons.includes(String(value.reason))) return null;
  const marker = markers.find((candidate) => candidate.kind === kind);
  const source = marker?.source === 'manual' || marker?.source === 'chapter' || marker?.source === 'external' || marker?.source === 'automatic'
    ? marker.source
    : null;
  if (value.state === 'detected' && !marker) {
    return { state: 'not-detected', reason: 'marker_missing', referenceCount: finiteNumber(value.referenceCount), supportCount: finiteNumber(value.supportCount), usableFrameRatio: finiteNumber(value.usableFrameRatio), confidence: null, source: null, analysisVersion: finiteNumber(root.markerAnalysisVersion), analyzedAt: typeof root.analyzedAt === 'string' ? root.analyzedAt : null };
  }
  return {
    state: value.state as PlaybackIntroAnalysis['state'],
    reason: value.reason as PlaybackIntroAnalysis['reason'],
    referenceCount: finiteNumber(value.referenceCount),
    supportCount: finiteNumber(value.supportCount),
    usableFrameRatio: finiteNumber(value.usableFrameRatio),
    confidence: marker?.confidence ?? (value.confidence === null ? null : finiteNumber(value.confidence)),
    source,
    analysisVersion: finiteNumber(root.markerAnalysisVersion),
    analyzedAt: typeof value.analyzedAt === 'string' ? value.analyzedAt : typeof root.analyzedAt === 'string' ? root.analyzedAt : null,
  };
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
