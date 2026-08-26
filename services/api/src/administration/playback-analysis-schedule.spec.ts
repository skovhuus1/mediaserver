import { describe, expect, it } from 'vitest';
import { parsePlaybackAnalysisSchedule, playbackAnalysisScheduleIsOpen } from './playback-analysis-schedule.js';

describe('playback analysis schedule', () => {
  it('opens only inside either configured Copenhagen window', () => {
    const schedule = parsePlaybackAnalysisSchedule({
      enabled: true,
      timezone: 'Europe/Copenhagen',
      windows: [{ start: '06:00', end: '09:00' }, { start: '16:00', end: '23:00' }],
    });
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-26T05:00:00Z'))).toBe(true);
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-26T10:00:00Z'))).toBe(false);
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-26T16:00:00Z'))).toBe(true);
  });

  it('supports a window crossing midnight', () => {
    const schedule = parsePlaybackAnalysisSchedule({ enabled: true, timezone: 'UTC', windows: [{ start: '22:00', end: '03:00' }] });
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-26T23:00:00Z'))).toBe(true);
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-27T02:59:00Z'))).toBe(true);
    expect(playbackAnalysisScheduleIsOpen(schedule, new Date('2026-08-27T03:00:00Z'))).toBe(false);
  });

  it('rejects overlapping windows and invalid timezones', () => {
    expect(() => parsePlaybackAnalysisSchedule({
      enabled: true,
      timezone: 'Europe/Copenhagen',
      windows: [{ start: '06:00', end: '10:00' }, { start: '09:00', end: '12:00' }],
    })).toThrow(/overlap/i);
    expect(() => parsePlaybackAnalysisSchedule({ enabled: true, timezone: 'Not/AZone', windows: [{ start: '06:00', end: '09:00' }] })).toThrow(/IANA/i);
  });
});
