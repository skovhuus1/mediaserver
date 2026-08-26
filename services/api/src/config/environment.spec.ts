import { describe, expect, it } from 'vitest';
import { corsAllowsPublicUrl, readCorsOrigins } from './environment';

describe('environment CORS origins', () => {
  it('adds the public URL origin to the effective API CORS allow-list', () => {
    expect(readCorsOrigins('http://localhost:6555', 'https://media.boltbytes.com/watch')).toEqual([
      'http://localhost:6555',
      'https://media.boltbytes.com',
    ]);
  });

  it('normalizes trailing slashes before checking Cast readiness', () => {
    const origins = readCorsOrigins('https://media.boltbytes.com/', undefined);
    expect(origins).toEqual(['https://media.boltbytes.com']);
    expect(corsAllowsPublicUrl(origins, 'https://media.boltbytes.com')).toBe(true);
  });

  it('adds account-level public URLs to diagnostics CORS origins', () => {
    const origins = readCorsOrigins(
      'http://serverens-ip:6555',
      undefined,
      'https://media.boltbytes.com',
    );
    expect(origins).toEqual([
      'http://serverens-ip:6555',
      'https://media.boltbytes.com',
    ]);
    expect(corsAllowsPublicUrl(origins, 'https://media.boltbytes.com')).toBe(true);
  });
});
