import { describe, expect, it } from 'vitest';
import { hasActiveProviderJob, isLiveTvRefreshDue, providerIdFromPayload } from './live-tv-maintenance-policy';

describe('Live TV maintenance policy', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');

  it('queues providers that have never been refreshed', () => {
    expect(isLiveTvRefreshDue(null, 60, now)).toBe(true);
  });

  it('uses an inclusive interval boundary and a five minute minimum', () => {
    expect(isLiveTvRefreshDue(new Date('2026-08-23T11:00:00.000Z'), 60, now)).toBe(true);
    expect(isLiveTvRefreshDue(new Date('2026-08-23T11:59:00.000Z'), 1, now)).toBe(false);
    expect(isLiveTvRefreshDue(new Date('2026-08-23T11:55:00.000Z'), 1, now)).toBe(true);
  });

  it('deduplicates only active jobs for the same provider and type', () => {
    const jobs = [{ type: 'live-tv.import', status: 'running', payload: { providerId: 'one' } }];
    expect(hasActiveProviderJob(jobs, 'live-tv.import', 'one')).toBe(true);
    expect(hasActiveProviderJob(jobs, 'live-tv.epg', 'one')).toBe(false);
    expect(hasActiveProviderJob(jobs, 'live-tv.import', 'two')).toBe(false);
  });

  it('rejects malformed payloads', () => {
    expect(providerIdFromPayload(null)).toBeNull();
    expect(providerIdFromPayload([])).toBeNull();
    expect(providerIdFromPayload({ providerId: 42 })).toBeNull();
  });
});
