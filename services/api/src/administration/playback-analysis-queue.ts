import type { PrismaClient } from '@prisma/client';
import {
  playbackAnalysisScheduleIsOpen,
  playbackAnalysisScheduleSettingKey,
  storedPlaybackAnalysisSchedule,
} from './playback-analysis-schedule.js';

export const playbackAnalysisQueuePauseSettingKey = 'runtime.playback-analysis.paused';

export type PlaybackAnalysisQueueState = {
  paused: boolean;
  effectivePaused: boolean;
  pauseReason: 'manual' | 'schedule' | null;
  queued: number;
  running: number;
  pausedJobs: number;
  scheduleEnabled: boolean;
  scheduleOpen: boolean;
};

export async function playbackAnalysisQueueState(
  prisma: PrismaClient,
  accountId: string,
): Promise<PlaybackAnalysisQueueState> {
  const [setting, scheduleSetting, grouped] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: playbackAnalysisQueuePauseSettingKey } },
      select: { value: true },
    }),
    prisma.systemSetting.findUnique({
      where: { accountId_key: { accountId, key: playbackAnalysisScheduleSettingKey } },
      select: { value: true },
    }),
    prisma.systemJob.groupBy({
      by: ['status'],
      where: { accountId, type: 'media.playback-assets', status: { in: ['queued', 'running', 'paused'] } },
      _count: { _all: true },
    }),
  ]);
  const count = (status: string) => grouped.find((entry) => entry.status === status)?._count._all ?? 0;
  const paused = setting?.value === true;
  const schedule = storedPlaybackAnalysisSchedule(scheduleSetting?.value);
  const scheduleOpen = playbackAnalysisScheduleIsOpen(schedule);
  const pauseReason = paused ? 'manual' : schedule.enabled && !scheduleOpen ? 'schedule' : null;
  return {
    paused,
    effectivePaused: pauseReason !== null,
    pauseReason,
    queued: count('queued'),
    running: count('running'),
    pausedJobs: count('paused'),
    scheduleEnabled: schedule.enabled,
    scheduleOpen,
  };
}

export async function setPlaybackAnalysisQueuePaused(
  prisma: PrismaClient,
  accountId: string,
  paused: boolean,
): Promise<PlaybackAnalysisQueueState> {
  await prisma.$transaction(async (tx) => {
    if (paused) {
      await tx.systemSetting.upsert({
        where: { accountId_key: { accountId, key: playbackAnalysisQueuePauseSettingKey } },
        create: { accountId, key: playbackAnalysisQueuePauseSettingKey, value: true, encrypted: false },
        update: { value: true, encrypted: false },
      });
      await tx.systemJob.updateMany({
        where: { accountId, type: 'media.playback-assets', status: 'queued' },
        data: { status: 'paused', workerId: null, lockedAt: null, leaseExpiresAt: null },
      });
      return;
    }
    await tx.systemSetting.deleteMany({ where: { accountId, key: playbackAnalysisQueuePauseSettingKey } });
    await tx.systemJob.updateMany({
      where: { accountId, type: 'media.playback-assets', status: 'paused' },
      data: { status: 'queued', availableAt: new Date(), workerId: null, lockedAt: null, leaseExpiresAt: null },
    });
  });
  return playbackAnalysisQueueState(prisma, accountId);
}
