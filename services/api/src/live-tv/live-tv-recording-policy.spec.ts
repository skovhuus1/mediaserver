import { describe, expect, it } from 'vitest';
import { parseRecordingRange, validateRecordingWindow } from './live-tv-recording-policy';

describe('Live TV recording policy', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  it('accepts present and future windows up to twelve hours', () => {
    expect(validateRecordingWindow(now, new Date('2026-08-23T13:00:00.000Z'), now)).toBeNull();
    expect(validateRecordingWindow(now, new Date('2026-08-24T00:00:00.000Z'), now)).toBeNull();
  });
  it('rejects ended, reversed, excessive and distant windows', () => {
    expect(validateRecordingWindow(new Date('2026-08-23T10:00:00.000Z'), new Date('2026-08-23T11:00:00.000Z'), now)).toBe('already_ended');
    expect(validateRecordingWindow(new Date('2026-08-23T13:00:00.000Z'), now, now)).toBe('invalid_window');
    expect(validateRecordingWindow(now, new Date('2026-08-24T00:00:00.001Z'), now)).toBe('too_long');
    expect(validateRecordingWindow(new Date('2026-09-23T12:00:00.000Z'), new Date('2026-09-23T13:00:00.000Z'), now)).toBe('too_far_ahead');
  });
  it('parses open, bounded and suffix byte ranges', () => {
    expect(parseRecordingRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19, length: 10 });
    expect(parseRecordingRange('bytes=90-', 100)).toEqual({ start: 90, end: 99, length: 10 });
    expect(parseRecordingRange('bytes=-10', 100)).toEqual({ start: 90, end: 99, length: 10 });
    expect(parseRecordingRange('bytes=100-', 100)).toBeNull();
  });
});
