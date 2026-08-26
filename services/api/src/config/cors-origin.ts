import { publicUrlOrigin } from './environment';

type AccountPublicUrlReader = {
  account: {
    findMany(input: {
      where: { externalUrl: { not: null } };
      select: { externalUrl: true };
    }): Promise<Array<{ externalUrl: string | null }>>;
  };
};

type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

const accountOriginCacheMs = 60_000;

export function createCorsOriginDelegate(
  configuredOrigins: readonly string[],
  reader: AccountPublicUrlReader,
) {
  const configured = new Set(configuredOrigins);
  let cachedAccountOrigins = new Set<string>();
  let cacheExpiresAt = 0;

  async function accountOrigins(): Promise<Set<string>> {
    const now = Date.now();
    if (now < cacheExpiresAt) return cachedAccountOrigins;
    const rows = await reader.account.findMany({
      where: { externalUrl: { not: null } },
      select: { externalUrl: true },
    });
    cachedAccountOrigins = new Set(
      rows.flatMap((row) => {
        const origin = publicUrlOrigin(row.externalUrl);
        return origin ? [origin] : [];
      }),
    );
    cacheExpiresAt = now + accountOriginCacheMs;
    return cachedAccountOrigins;
  }

  return (origin: string | undefined, callback: CorsOriginCallback): void => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = publicUrlOrigin(origin);
    if (!normalized || normalized !== origin) {
      callback(null, false);
      return;
    }
    if (configured.has('*') || configured.has(normalized)) {
      callback(null, true);
      return;
    }
    void accountOrigins()
      .then((origins) => callback(null, origins.has(normalized)))
      .catch((error: unknown) => {
        callback(
          error instanceof Error
            ? error
            : new Error('CORS origin lookup failed'),
        );
      });
  };
}
