import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-value';

const key = `base64:${Buffer.alloc(32, 7).toString('base64')}`;

describe('encrypted system settings', () => {
  it('round-trips a secret without storing plaintext', () => {
    const encrypted = encryptSecret('tmdb-secret', key);
    expect(JSON.stringify(encrypted)).not.toContain('tmdb-secret');
    expect(decryptSecret(encrypted, key)).toBe('tmdb-secret');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSecret('tmdb-secret', key);
    expect(() => decryptSecret({ ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') }, key)).toThrow();
  });
});
