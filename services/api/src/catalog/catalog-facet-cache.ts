export type CatalogFacetValue = {
  categories: string[];
  libraries: Array<{ id: string; name: string; type?: string }>;
};

type CacheEntry = {
  expiresAt: number;
  value: CatalogFacetValue | null;
  loading: Promise<CatalogFacetValue> | null;
};

export class CatalogFacetCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maximumAccounts = 256,
  ) {}

  async get(
    accountId: string,
    loader: () => Promise<CatalogFacetValue>,
    now = Date.now(),
  ): Promise<CatalogFacetValue> {
    const cached = this.entries.get(accountId);
    if (cached?.value && cached.expiresAt > now) return cached.value;
    if (cached?.loading) return cached.loading;

    const loading = loader().then((value) => {
      this.entries.delete(accountId);
      this.entries.set(accountId, { value, expiresAt: Date.now() + this.ttlMs, loading: null });
      this.trim();
      return value;
    }).catch((error: unknown) => {
      this.entries.delete(accountId);
      throw error;
    });
    this.entries.set(accountId, {
      value: cached?.value ?? null,
      expiresAt: cached?.expiresAt ?? 0,
      loading,
    });
    return loading;
  }

  invalidate(accountId: string): void {
    this.entries.delete(accountId);
  }

  private trim(): void {
    while (this.entries.size > this.maximumAccounts) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}
