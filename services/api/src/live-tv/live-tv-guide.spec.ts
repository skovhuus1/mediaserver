import { describe, expect, it } from 'vitest';
import { MAX_LIVE_TV_GUIDE_PAGE_SIZE, presentLiveTvGuidePrograms, resolveLiveTvGuideWindow } from './live-tv-guide';

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

  it('presents M3U channel metadata as a non-recordable guide fallback', () => {
    const from = new Date('2026-08-23T12:00:00.000Z');
    const to = new Date('2026-08-23T13:00:00.000Z');

    expect(presentLiveTvGuidePrograms({
      id: 'channel-1',
      name: 'DR 1',
      groupName: 'Dansk',
      logoUrl: 'https://img.example.test/dr1.png',
      programs: [],
    }, from, to)).toEqual([{
      id: 'm3u:channel-1:1787486400000',
      startsAt: from,
      endsAt: to,
      title: 'DR 1',
      subtitle: 'Dansk',
      description: 'Kanalnavn, logo og gruppe er importeret fra M3U-listen. Tilføj eller autoopdag XMLTV for detaljerede programtider.',
      category: 'Dansk',
      iconUrl: 'https://img.example.test/dr1.png',
      episode: null,
      source: 'm3u',
      recordable: false,
    }]);
  });
});
