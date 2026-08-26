import { describe, expect, it, vi } from 'vitest';
import { playbackAnalysisQueuePauseSettingKey, playbackAnalysisQueueState, setPlaybackAnalysisQueuePaused } from './playback-analysis-queue.js';

describe('playback analysis queue pause policy', () => {
  it('parks only queued playback analyses and lets running work finish', async () => {
    const tx = { systemSetting: { upsert: vi.fn() }, systemJob: { updateMany: vi.fn() } };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
      systemSetting: { findUnique: vi.fn().mockResolvedValue({ value: true }) },
      systemJob: { groupBy: vi.fn().mockResolvedValue([{ status: 'paused', _count: { _all: 12 } }, { status: 'running', _count: { _all: 1 } }]) },
    };
    await expect(setPlaybackAnalysisQueuePaused(prisma as never, 'account-1', true)).resolves.toMatchObject({ paused: true, effectivePaused: true, pauseReason: 'manual', queued: 0, running: 1, pausedJobs: 12 });
    expect(tx.systemSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId_key: { accountId: 'account-1', key: playbackAnalysisQueuePauseSettingKey } } }));
    expect(tx.systemJob.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', type: 'media.playback-assets', status: 'queued' },
      data: { status: 'paused', workerId: null, lockedAt: null, leaseExpiresAt: null },
    });
  });

  it('resumes parked jobs without resetting attempts', async () => {
    const tx = { systemSetting: { deleteMany: vi.fn() }, systemJob: { updateMany: vi.fn() } };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
      systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      systemJob: { groupBy: vi.fn().mockResolvedValue([{ status: 'queued', _count: { _all: 12 } }]) },
    };
    await expect(setPlaybackAnalysisQueuePaused(prisma as never, 'account-1', false)).resolves.toMatchObject({ paused: false, effectivePaused: false, pauseReason: null, queued: 12, running: 0, pausedJobs: 0 });
    expect(tx.systemJob.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', type: 'media.playback-assets', status: 'paused' },
      data: { status: 'queued', availableAt: expect.any(Date), workerId: null, lockedAt: null, leaseExpiresAt: null },
    });
  });

  it('reports persistent pause state independently of job counts', async () => {
    const prisma = { systemSetting: { findUnique: vi.fn().mockResolvedValue({ value: true }) }, systemJob: { groupBy: vi.fn().mockResolvedValue([]) } };
    await expect(playbackAnalysisQueueState(prisma as never, 'account-1')).resolves.toMatchObject({ paused: true, effectivePaused: true, pauseReason: 'manual', queued: 0, running: 0, pausedJobs: 0 });
  });
});
