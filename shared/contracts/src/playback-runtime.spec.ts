import { describe, expect, it } from 'vitest';
import { chooseDefaultWebVttSubtitle, deferredUpscaleLevelCap } from './playback-runtime.js';

describe('playback runtime policy', () => {
  it('never auto-selects a burn-in subtitle and falls through to the next preferred WebVTT language', () => {
    expect(chooseDefaultWebVttSubtitle([
      { id: 'burnin-da', language: 'dan', label: 'Dansk PGS', delivery: 'burn_in' },
      { id: 'webvtt-en', language: 'eng', label: 'English', delivery: 'webvtt' },
    ], ['da', 'en'], 'auto')).toBe('webvtt-en');
  });

  it('selects forced WebVTT only in forced mode', () => {
    expect(chooseDefaultWebVttSubtitle([
      { id: 'normal-da', language: 'dan', label: 'Dansk', delivery: 'webvtt' },
      { id: 'forced-da', language: 'dan', label: 'Dansk forced', delivery: 'webvtt' },
    ], ['da'], 'forced')).toBe('forced-da');
  });

  it('caps Auto at the highest native rendition until the upscale buffer gate opens', () => {
    expect(deferredUpscaleLevelCap([
      { height: 360, upscaled: false },
      { height: 720, upscaled: false },
      { height: 1080, upscaled: true },
    ], 720, true)).toBe(1);
    expect(deferredUpscaleLevelCap([
      { height: 720, upscaled: false },
    ], 720, true)).toBe(-1);
  });
});
