import { describe, expect, it } from 'vitest';
import { createPasswordChangeToken, verifyPasswordChangeToken } from '../src/auth/password-change-token';

const secret = 's'.repeat(64);
const now = Date.UTC(2026, 6, 29, 12, 0, 0);

describe('password change token', () => {
  it('is valid for ten minutes and bound to the current password hash', () => {
    const token = createPasswordChangeToken('user', 'account', 'hash-a', secret, now);
    expect(verifyPasswordChangeToken(token, 'hash-a', secret, now + 599_000)).toMatchObject({
      sub: 'user',
      accountId: 'account',
    });
    expect(verifyPasswordChangeToken(token, 'hash-a', secret, now + 600_000)).toBeNull();
    expect(verifyPasswordChangeToken(token, 'hash-b', secret, now)).toBeNull();
  });

  it('rejects tampering', () => {
    const token = createPasswordChangeToken('user', 'account', 'hash-a', secret, now);
    expect(verifyPasswordChangeToken(`${token.slice(0, -1)}x`, 'hash-a', secret, now)).toBeNull();
  });
});
