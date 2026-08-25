import { Prisma, type PrismaClient, type SystemJob } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS,
  parseVisibilityPayload,
  processLiveTvChannelVisibilityJob,
} from './live-tv-channel-visibility-job.js';

function visibilityJob(payload: Record<string, unknown>): SystemJob {
  const now = new Date();
  return {
    id: 'job-1', accountId: 'account-1', type: 'live-tv.channel-visibility', status: 'running',
    payload: payload as Prisma.JsonObject, availableAt: now, lockedAt: now, leaseExpiresAt: now, workerId: 'worker-1',
    attemptCount: 1, maxAttempts: 3, createdAt: now, updatedAt: now,
  };
}

describe('Live TV channel visibility worker', () => {
  it('updates a large account scope atomically and stores an observable result', async () => {
    const tx = {
      liveTvChannel: {
        count: vi.fn().mockResolvedValue(246_570),
        updateMany: vi.fn().mockResolvedValue({ count: 246_470 }),
      },
      liveTvLease: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      liveTvRecording: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      systemJob: { count: vi.fn().mockResolvedValue(1), updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      systemJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaClient;
    const job = visibilityJob({ scope: 'all', action: 'hide', requestedBy: 'user-1' });
    const renew = vi.fn().mockResolvedValue(undefined);

    const result = await processLiveTvChannelVisibilityJob(prisma, job, renew);

    expect(result).toMatchObject({ matchedCount: 246_570, changedCount: 246_470, action: 'hide' });
    expect(tx.liveTvChannel.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', enabled: true },
      data: { enabled: false },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS);
    expect(job.payload).toMatchObject({ result: { changedCount: 246_470, auditAction: 'live_tv.channel.all_visibility' } });
    expect(renew).toHaveBeenCalled();
  });

  it('aborts the transaction when the job was cancelled', async () => {
    const tx = {
      liveTvChannel: {
        count: vi.fn().mockResolvedValue(10),
        updateMany: vi.fn().mockResolvedValue({ count: 10 }),
      },
      systemJob: { count: vi.fn().mockResolvedValue(0) },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      systemJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaClient;

    await expect(processLiveTvChannelVisibilityJob(
      prisma,
      visibilityJob({ scope: 'group', action: 'hide', groupName: 'Sport' }),
      vi.fn().mockResolvedValue(undefined),
    )).rejects.toThrow('annulleret');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects malformed group jobs before touching the catalog', () => {
    expect(() => parseVisibilityPayload({ scope: 'group', action: 'show' })).toThrow('payload is invalid');
  });
});
