import { describe, expect, it, vi } from 'vitest';
import { LiveTvService } from './live-tv.service';

describe('Live TV visibility queue', () => {
  it('queues and returns one durable all-catalog job', async () => {
    const job = {
      id: 'job-1', type: 'live-tv.channel-visibility', status: 'queued',
      payload: { scope: 'all', action: 'hide' },
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      systemJob: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(job),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const service = new LiveTvService(prisma as never);
    const actor = { accountId: 'account-1', sub: 'user-1', profileId: null } as never;

    await expect(service.bulkUpdateAllChannels(actor, { action: 'hide' })).resolves.toBe(job);
    expect(tx.systemJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      accountId: 'account-1', type: 'live-tv.channel-visibility', status: 'queued',
      payload: expect.objectContaining({ scope: 'all', action: 'hide', requestedBy: 'user-1' }),
    }) });
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });
});
