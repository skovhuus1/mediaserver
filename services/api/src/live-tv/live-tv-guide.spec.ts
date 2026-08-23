import { describe, expect, it } from 'vitest';
import { MAX_LIVE_TV_GUIDE_PAGE_SIZE, resolveLiveTvGuideWindow } from './live-tv-guide';

describe('Live TV guide query policy', () => {
  it('bounds malformed pagination and a requested window to 48 hours', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const result = resolveLiveTvGuideWindow({
      from: '2026-08-23T10:00:00.000Z',
      to: '2026-09-30T10:00:00.000Z',
      page: -10,
      pageSize: 50_000,
    }, now);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(MAX_LIVE_TV_GUIDE_PAGE_SIZE);
    expect(result.to.getTime() - result.from.getTime()).toBe(48 * 60 * 60_000);
  });

  it('uses a usable default window when dates are invalid', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const result = resolveLiveTvGuideWindow({ from: 'invalid', to: 'invalid' }, now);
    expect(result.from.toISOString()).toBe('2026-08-23T11:30:00.000Z');
    expect(result.to.getTime() - result.from.getTime()).toBe(12 * 60 * 60_000);
  });
});
