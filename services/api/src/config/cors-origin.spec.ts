import { describe, expect, it, vi } from 'vitest';
import { createCorsOriginDelegate } from './cors-origin';

describe('dynamic API CORS origins', () => {
  it('allows configured origins and account external URL origins', async () => {
    const reader = {
      account: {
        findMany: vi.fn().mockResolvedValue([
          { externalUrl: 'https://media.boltbytes.com' },
        ]),
      },
    };
    const origin = createCorsOriginDelegate(['http://serverens-ip:6555'], reader);

    await expect(checkOrigin(origin, 'http://serverens-ip:6555')).resolves.toBe(true);
    await expect(checkOrigin(origin, 'https://media.boltbytes.com')).resolves.toBe(true);
    await expect(checkOrigin(origin, 'https://evil.example')).resolves.toBe(false);
    expect(reader.account.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects origins with paths instead of silently widening access', async () => {
    const origin = createCorsOriginDelegate(['https://media.boltbytes.com'], {
      account: { findMany: vi.fn().mockResolvedValue([]) },
    });
    await expect(checkOrigin(origin, 'https://media.boltbytes.com/app')).resolves.toBe(false);
  });
});

function checkOrigin(
  origin: ReturnType<typeof createCorsOriginDelegate>,
  value: string | undefined,
) {
  return new Promise<boolean>((resolve, reject) => {
    origin(value, (error, allow) => {
      if (error) reject(error);
      else resolve(Boolean(allow));
    });
  });
}
