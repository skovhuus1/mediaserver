import type { MarkerDetectionDiagnostics } from '@boltbytes/contracts';

/**
 * Recaps are episode-specific and cannot be inferred from a repeated sequence.
 * Only chapter metadata or an external provider may create a recap marker.
 */
export function recapRequiresExplicitEvidence(
  referenceCount = 0,
): MarkerDetectionDiagnostics {
  return {
    state: 'not-detected',
    reason: 'explicit_evidence_required',
    referenceCount,
    supportCount: 0,
    usableFrameRatio: 0,
    confidence: null,
    marker: null,
  };
}
