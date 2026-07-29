import { describe, expect, it } from 'vitest';
import { createCastStreamToken, resolveStreamToken } from '../src/playback/cast-stream-token';

const secret = 's'.repeat(64);
const streamToken = 'stream-token-that-is-long-enough-for-validation';
const now = Date.UTC(2026, 6, 29, 12, 0, 0);

describe('cast stream token', () => {
  it('signs a session-bound token and resolves the original stream token', () => {
    const signed = createCastStreamToken('session-a', streamToken, secret, 3600, now);

    expect(signed.expiresAt.toISOString()).toBe('2026-07-29T13:00:00.000Z');
    expect(resolveStreamToken('session-a', signed.token, secret, now + 1000)).toBe(streamToken);
  });

  it('rejects tampering, another session and expiration', () => {
    const signed = createCastStreamToken('session-a', streamToken, secret, 60, now);
    const tampered = `${signed.token.slice(0, -1)}x`;

    expect(resolveStreamToken('session-a', tampered, secret, now)).toBeNull();
    expect(resolveStreamToken('session-b', signed.token, secret, now)).toBeNull();
    expect(resolveStreamToken('session-a', signed.token, secret, now + 61_000)).toBeNull();
  });

  it('leaves the existing opaque browser stream token unchanged', () => {
    expect(resolveStreamToken('session-a', streamToken, secret, now)).toBe(streamToken);
  });
});
