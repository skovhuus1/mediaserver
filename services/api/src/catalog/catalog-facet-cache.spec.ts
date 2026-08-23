import { describe, expect, it, vi } from 'vitest';
import { CatalogFacetCache } from './catalog-facet-cache';

describe('CatalogFacetCache', () => {
  it('coalesces concurrent loads and serves the cached account value', async () => {
    const value = { categories: ['Drama'], libraries: [{ id: 'one', name: 'Film' }] };
    const loader = vi.fn().mockResolvedValue(value);
    const cache = new CatalogFacetCache(60_000);

    const [first, second] = await Promise.all([
      cache.get('account-1', loader, 1_000),
      cache.get('account-1', loader, 1_000),
    ]);
    const third = await cache.get('account-1', loader, 1_001);

    expect(first).toEqual(value);
    expect(second).toEqual(value);
    expect(third).toEqual(value);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not retain failed loads', async () => {
    const cache = new CatalogFacetCache();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ categories: [], libraries: [] });

    await expect(cache.get('account-1', loader)).rejects.toThrow('database unavailable');
    await expect(cache.get('account-1', loader)).resolves.toEqual({ categories: [], libraries: [] });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
