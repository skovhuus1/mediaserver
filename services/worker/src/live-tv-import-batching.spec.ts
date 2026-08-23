import { describe, expect, it, vi } from 'vitest';
import { disableMissingLiveTvSources, forEachLiveTvEntryByIdentity } from './live-tv-import-batching.js';

describe('Live TV import batching', () => {
  it('serializes duplicate identities while processing independent channels concurrently', async () => {
    const active = new Set<string>();
    let maximumActive = 0;
    const order: string[] = [];
    await forEachLiveTvEntryByIdentity(
      [{ key: 'a', value: 1 }, { key: 'b', value: 1 }, { key: 'a', value: 2 }],
      (entry) => entry.key,
      async (entry) => {
        expect(active.has(entry.key)).toBe(false);
        active.add(entry.key);
        maximumActive = Math.max(maximumActive, active.size);
        await new Promise((resolve) => setTimeout(resolve, 2));
        order.push(`${entry.key}${entry.value}`);
        active.delete(entry.key);
      },
      2,
    );

    expect(maximumActive).toBe(2);
    expect(order.indexOf('a1')).toBeLessThan(order.indexOf('a2'));
  });

  it('disables stale sources in bounded id batches instead of one unbounded NOT IN query', async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const store = {
      liveTvChannelSource: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'keep', streamFingerprint: 'seen' },
          { id: 'stale-1', streamFingerprint: 'old-1' },
          { id: 'stale-2', streamFingerprint: 'old-2' },
          { id: 'stale-3', streamFingerprint: 'old-3' },
        ]),
        updateMany,
      },
    };

    await expect(disableMissingLiveTvSources(store, 'connection-1', ['seen'], 2)).resolves.toBe(3);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['stale-1', 'stale-2'] } },
      data: { enabled: false },
    });
  });
});
