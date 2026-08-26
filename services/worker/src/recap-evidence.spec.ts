import { describe, expect, it } from 'vitest';

import { recapRequiresExplicitEvidence } from './recap-evidence.js';

describe('recapRequiresExplicitEvidence', () => {
  it('never creates a recap from repeated local fingerprints', () => {
    expect(recapRequiresExplicitEvidence(4)).toEqual({
      state: 'not-detected',
      reason: 'explicit_evidence_required',
      referenceCount: 4,
      supportCount: 0,
      usableFrameRatio: 0,
      confidence: null,
      marker: null,
    });
  });
});
