import { BadRequestException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

export const playbackAnalysisScheduleSettingKey = 'runtime.playback-analysis.schedule';

export type PlaybackAnalysisScheduleWindow = {
  start: string;
  end: string;
};

export type PlaybackAnalysisSchedule = {
  enabled: boolean;
  timezone: string;
  windows: PlaybackAnalysisScheduleWindow[];
};

const defaultPlaybackAnalysisSchedule: PlaybackAnalysisSchedule = {
  enabled: false,
  timezone: 'Europe/Copenhagen',
  windows: [],
};

function fail(message: string): never {
  throw new BadRequestException({ code: 'playback_analysis_schedule_invalid', message });
}

function timeMinutes(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) fail('Tidspunkter skal skrives som HH:mm.');
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  if (hours > 23 || minutes > 59) fail('Tidspunkter skal ligge mellem 00:00 og 23:59.');
  return hours * 60 + minutes;
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value }).format(new Date());
  } catch {
    fail('Tidszonen er ikke en gyldig IANA-tidszone.');
  }
}

export function parsePlaybackAnalysisSchedule(input: unknown): PlaybackAnalysisSchedule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Tidsplanen er ugyldig.');
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.enabled !== 'boolean') fail('Tidsplanen skal have en enabled-værdi.');
  const timezone = typeof candidate.timezone === 'string' ? candidate.timezone.trim() : '';
  if (!timezone) fail('Tidsplanen skal have en tidszone.');
  assertTimezone(timezone);
  if (!Array.isArray(candidate.windows)) fail('Tidsplanens kørselsvinduer er ugyldige.');
  if (candidate.windows.length > 8) fail('Der kan højst oprettes otte kørselsvinduer.');

  const occupied = new Uint8Array(1440);
  const windows = candidate.windows.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Et kørselsvindue er ugyldigt.');
    const window = entry as Record<string, unknown>;
    const startMinute = timeMinutes(window.start);
    const endMinute = timeMinutes(window.end);
    const start = window.start as string;
    const end = window.end as string;
    const includes = (minute: number) => startMinute === endMinute
      || (startMinute < endMinute
        ? minute >= startMinute && minute < endMinute
        : minute >= startMinute || minute < endMinute);
    for (let minute = 0; minute < occupied.length; minute += 1) {
      if (!includes(minute)) continue;
      if (occupied[minute]) fail('Kørselsvinduer må ikke overlappe hinanden.');
      occupied[minute] = 1;
    }
    return { start, end };
  }).sort((left, right) => left.start.localeCompare(right.start));

  if (candidate.enabled && windows.length === 0) fail('En aktiv tidsplan skal have mindst ét kørselsvindue.');
  return { enabled: candidate.enabled, timezone, windows };
}

export function storedPlaybackAnalysisSchedule(value: Prisma.JsonValue | null | undefined): PlaybackAnalysisSchedule {
  if (value == null) return { ...defaultPlaybackAnalysisSchedule, windows: [] };
  try {
    return parsePlaybackAnalysisSchedule(value);
  } catch {
    return { ...defaultPlaybackAnalysisSchedule, windows: [] };
  }
}

export function playbackAnalysisScheduleIsOpen(schedule: PlaybackAnalysisSchedule, now = new Date()): boolean {
  if (!schedule.enabled) return true;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: schedule.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const current = hours * 60 + minutes;
  return schedule.windows.some((window) => {
    const start = timeMinutes(window.start);
    const end = timeMinutes(window.end);
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
  });
}

export async function loadPlaybackAnalysisSchedule(
  prisma: PrismaClient,
  accountId: string,
): Promise<PlaybackAnalysisSchedule> {
  const setting = await prisma.systemSetting.findUnique({
    where: { accountId_key: { accountId, key: playbackAnalysisScheduleSettingKey } },
    select: { value: true },
  });
  return storedPlaybackAnalysisSchedule(setting?.value);
}

export async function savePlaybackAnalysisSchedule(
  prisma: PrismaClient,
  accountId: string,
  input: unknown,
): Promise<PlaybackAnalysisSchedule> {
  const schedule = parsePlaybackAnalysisSchedule(input);
  await prisma.systemSetting.upsert({
    where: { accountId_key: { accountId, key: playbackAnalysisScheduleSettingKey } },
    create: {
      accountId,
      key: playbackAnalysisScheduleSettingKey,
      value: schedule as unknown as Prisma.InputJsonValue,
      encrypted: false,
    },
    update: { value: schedule as unknown as Prisma.InputJsonValue, encrypted: false },
  });
  return schedule;
}
