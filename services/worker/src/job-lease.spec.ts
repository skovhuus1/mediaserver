import { afterEach, describe, expect, it, vi } from 'vitest';
import { withJobLeaseHeartbeat } from './job-lease.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('withJobLeaseHeartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renews a long-running job before its lease can expire', async () => {
    vi.useFakeTimers();
    const task = deferred<string>();
    const renew = vi.fn().mockResolvedValue(undefined);
    const result = withJobLeaseHeartbeat(() => task.promise, renew, { leaseMs: 60_000 });

    await vi.advanceTimersByTimeAsync(40_000);
    expect(renew).toHaveBeenCalledTimes(2);

    task.resolve('completed');
    await expect(result).resolves.toBe('completed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('never overlaps lease renewals', async () => {
    vi.useFakeTimers();
    const task = deferred<void>();
    const firstRenewal = deferred<void>();
    const renew = vi.fn().mockReturnValue(firstRenewal.promise);
    const result = withJobLeaseHeartbeat(() => task.promise, renew, { leaseMs: 60_000 });

    await vi.advanceTimersByTimeAsync(50_000);
    expect(renew).toHaveBeenCalledTimes(1);

    firstRenewal.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(renew).toHaveBeenCalledTimes(2);

    task.resolve();
    firstRenewal.resolve();
    await result;
  });

  it('propagates a failed renewal instead of completing an uncertain lease', async () => {
    vi.useFakeTimers();
    const task = deferred<void>();
    const renew = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const result = withJobLeaseHeartbeat(() => task.promise, renew, { leaseMs: 60_000 });

    await vi.advanceTimersByTimeAsync(20_000);
    task.resolve();

    await expect(result).rejects.toThrow('database unavailable');
  });
});
