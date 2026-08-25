import { describe, expect, it } from 'vitest';
import { playbackIntroAnalysis, playbackJobMediaId, playbackMarkerAnalysis, validateManualPlaybackMarkers } from './playback-analysis';

describe('playback analysis policy', () => {
  it('accepts ordered manual markers inside the media duration', () => {
    expect(validateManualPlaybackMarkers([
      { kind: 'recap', startMs: 0, endMs: 40_000 },
      { kind: 'intro', startMs: 45_000, endMs: 95_000 },
      { kind: 'credits', startMs: 2_500_000, endMs: 2_600_000 },
    ], 2_600_000)).toBeNull();
  });

  it('rejects duplicate, overlapping and out-of-range markers', () => {
    expect(validateManualPlaybackMarkers([
      { kind: 'intro', startMs: 10_000, endMs: 50_000 },
      { kind: 'intro', startMs: 60_000, endMs: 80_000 },
    ], 100_000)).toContain('kun forekomme');
    expect(validateManualPlaybackMarkers([
      { kind: 'recap', startMs: 0, endMs: 50_000 },
      { kind: 'intro', startMs: 45_000, endMs: 80_000 },
    ], 100_000)).toContain('overlapper');
    expect(validateManualPlaybackMarkers([
      { kind: 'credits', startMs: 90_000, endMs: 120_000 },
    ], 100_000)).toContain('varighed');
  });

  it('extracts media ids only from valid job payloads', () => {
    expect(playbackJobMediaId({ mediaId: 'media-1' })).toBe('media-1');
    expect(playbackJobMediaId({ mediaId: 42 })).toBeNull();
    expect(playbackJobMediaId(null)).toBeNull();
  });

  it('exposes only validated intro-analysis diagnostics from manifests', () => {
    expect(playbackIntroAnalysis({ analysis: { intro: {
      state: 'pending',
      reason: 'insufficient_references',
      referenceCount: 1,
      supportCount: 0,
      usableFrameRatio: 0.74,
      confidence: null,
    } } })).toEqual({
      state: 'pending',
      reason: 'insufficient_references',
      referenceCount: 1,
      supportCount: 0,
      usableFrameRatio: 0.74,
      confidence: null,
    });
    expect(playbackIntroAnalysis({ analysis: { intro: { state: 'ready', reason: 'guessed' } } })).toBeNull();
  });

  it('exposes recap and intro diagnostics separately from manifests', () => {
    expect(playbackMarkerAnalysis({ analysis: {
      recap: {
        state: 'detected',
        reason: 'chapter_marker',
        referenceCount: 0,
        supportCount: 0,
        usableFrameRatio: 1,
        confidence: 1,
      },
      intro: {
        state: 'not-detected',
        reason: 'no_repeated_sequence',
        referenceCount: 2,
        supportCount: 0,
        usableFrameRatio: 0.68,
        confidence: null,
      },
    } })).toEqual({
      recap: {
        state: 'detected',
        reason: 'chapter_marker',
        referenceCount: 0,
        supportCount: 0,
        usableFrameRatio: 1,
        confidence: 1,
      },
      intro: {
        state: 'not-detected',
        reason: 'no_repeated_sequence',
        referenceCount: 2,
        supportCount: 0,
        usableFrameRatio: 0.68,
        confidence: null,
      },
    });
  });
});
