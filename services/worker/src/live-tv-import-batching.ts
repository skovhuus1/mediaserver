type LiveTvSourceStore = {
  liveTvChannelSource: {
    findMany(input: {
      where: { connectionId: string };
      select: { id: true; streamFingerprint: true };
    }): Promise<Array<{ id: string; streamFingerprint: string }>>;
    updateMany(input: {
      where: { id: { in: string[] } };
      data: { enabled: false };
    }): Promise<{ count: number }>;
  };
};

export async function forEachLiveTvEntryByIdentity<T>(
  entries: readonly T[],
  identity: (entry: T) => string,
  handler: (entry: T) => Promise<void>,
  concurrency = 16,
): Promise<void> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = identity(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const pending = [...groups.values()];
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), pending.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < pending.length) {
      const group = pending[cursor++];
      if (!group) continue;
      for (const entry of group) await handler(entry);
    }
  }));
}

export async function disableMissingLiveTvSources(
  store: LiveTvSourceStore,
  connectionId: string,
  seenFingerprints: readonly string[],
  batchSize = 1_000,
): Promise<number> {
  const seen = new Set(seenFingerprints);
  const existing = await store.liveTvChannelSource.findMany({
    where: { connectionId },
    select: { id: true, streamFingerprint: true },
  });
  const staleIds = existing.flatMap((source) => seen.has(source.streamFingerprint) ? [] : [source.id]);
  let disabled = 0;
  for (let offset = 0; offset < staleIds.length; offset += batchSize) {
    const ids = staleIds.slice(offset, offset + batchSize);
    const result = await store.liveTvChannelSource.updateMany({
      where: { id: { in: ids } },
      data: { enabled: false },
    });
    disabled += result.count;
  }
  return disabled;
}
