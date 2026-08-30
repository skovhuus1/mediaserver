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
  orphaned: number;
  scheduleEnabled: boolean;
  scheduleOpen: boolean;
};

export async function playbackAnalysisQueueState(
  prisma: PrismaClient,
  accountId: string,
): Promise<PlaybackAnalysisQueueState> {
  const orphanCutoff = new Date(Date.now() - 15 * 60_000);
  const [setting, scheduleSetting, grouped, orphanedRows] = await Promise.all([
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
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM media_playback_assets AS asset
      WHERE asset.account_id = ${accountId}
        AND asset.status IN ('queued', 'generating')
        AND asset.updated_at <= ${orphanCutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM system_jobs AS job
          WHERE job.account_id = asset.account_id
            AND job.type = 'media.playback-assets'
            AND job.status IN ('queued', 'running', 'paused')
            AND job.payload->>'mediaId' = asset.media_id
        )
    `,
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
    orphaned: orphanedRows[0]?.count ?? 0,
    scheduleEnabled: schedule.enabled,
    scheduleOpen,
  };
}

export async function recoverOrphanedPlaybackAnalysis(
  prisma: PrismaClient,
  accountId: string,
  limit = 10_000,
): Promise<{ recovered: number; remaining: number; limited: boolean }> {
  const cutoff = new Date(Date.now() - 15 * 60_000);
  const recovery = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('bbmedia:playback-analysis-recovery'),
        hashtext(CAST(${accountId} AS text))
      )::text AS lock_result
    `;
    const assets = await tx.$queryRaw<Array<{ mediaId: string; spriteDirectory: string | null }>>`
      SELECT asset.media_id AS "mediaId", asset.sprite_directory AS "spriteDirectory"
      FROM media_playback_assets AS asset
      WHERE asset.account_id = ${accountId}
        AND asset.status IN ('queued', 'generating')
        AND asset.updated_at <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM system_jobs AS job
          WHERE job.account_id = asset.account_id
            AND job.type = 'media.playback-assets'
            AND job.status IN ('queued', 'running', 'paused')
            AND job.payload->>'mediaId' = asset.media_id
        )
      ORDER BY asset.updated_at ASC, asset.media_id ASC
      LIMIT ${limit}
      FOR UPDATE OF asset
    `;
    if (!assets.length) return { recovered: 0, limited: false };
    const mediaIds = assets.map((asset) => asset.mediaId);
    await tx.mediaPlaybackAsset.updateMany({
      where: { accountId, mediaId: { in: mediaIds } },
      data: { status: 'queued', error: null },
    });
    const startedAt = Date.now();
    await tx.systemJob.createMany({
      data: assets.map((asset, index) => ({
        accountId,
        type: 'media.playback-assets',
        status: 'queued',
        payload: { mediaId: asset.mediaId, force: true, analysisScope: asset.spriteDirectory ? 'marker_only' : 'full' },
        availableAt: new Date(startedAt + index),
        maxAttempts: 3,
      })),
    });
    return { recovered: assets.length, limited: assets.length === limit };
  });
  const remainingRows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM media_playback_assets AS asset
    WHERE asset.account_id = ${accountId}
      AND asset.status IN ('queued', 'generating')
      AND asset.updated_at <= ${cutoff}
      AND NOT EXISTS (
        SELECT 1
        FROM system_jobs AS job
        WHERE job.account_id = asset.account_id
          AND job.type = 'media.playback-assets'
          AND job.status IN ('queued', 'running', 'paused')
          AND job.payload->>'mediaId' = asset.media_id
      )
  `;
  return { ...recovery, remaining: remainingRows[0]?.count ?? 0 };
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
