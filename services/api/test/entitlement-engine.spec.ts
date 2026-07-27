import { addCalendarDelay, applyEntitlementOverrides, decideEntitlement } from '../src/entitlements/entitlement-engine';
import type { EffectiveEntitlements } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

const base: EffectiveEntitlements = {
  maxConcurrentStreams: 1,
  maxRegisteredDevices: 2,
  maxVideoResolution: 1080,
  maxVideoBitrate: 8000,
  allowDirectPlay: true,
  allowDirectStream: false,
  allowVideoTranscode: false,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: false,
  allowChromecast: false,
  allowOfflineDownload: false,
  releaseDelayMonths: 3,
  releaseDelayDays: 0,
};

describe('entitlement engine', () => {
  it('clamps calendar-month boundaries deterministically', () => {
    expect(addCalendarDelay(new Date('2025-01-31T12:00:00.000Z'), 1, 0).toISOString())
      .toBe('2025-02-28T12:00:00.000Z');
    expect(addCalendarDelay(new Date('2024-01-31T12:00:00.000Z'), 1, 0).toISOString())
      .toBe('2024-02-29T12:00:00.000Z');
  });

  it('applies user override before profile override and ignores unknown fields', () => {
    const effective = applyEntitlementOverrides(base, [
      { maxConcurrentStreams: 2, allowChromecast: true, injected: 'ignored' },
      { maxConcurrentStreams: 3 },
    ]);
    expect(effective.maxConcurrentStreams).toBe(3);
    expect(effective.allowChromecast).toBe(true);
    expect(effective).not.toHaveProperty('injected');
  });

  it('denies content exactly before and allows exactly at the availability boundary', () => {
    const releaseDate = new Date('2025-01-31T00:00:00.000Z');
    expect(decideEntitlement({
      action: 'playback',
      entitlements: base,
      releaseDate,
      availabilityOverride: null,
      now: new Date('2025-04-29T23:59:59.999Z'),
    }).code).toBe('release_window_active');
    expect(decideEntitlement({
      action: 'playback',
      entitlements: base,
      releaseDate,
      availabilityOverride: null,
      now: new Date('2025-04-30T00:00:00.000Z'),
    }).allowed).toBe(true);
  });
});
