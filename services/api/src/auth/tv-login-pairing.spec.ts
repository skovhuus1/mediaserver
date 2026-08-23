import { describe, expect, it } from 'vitest';
import {
  formatTvUserCode,
  normalizeTvUserCode,
  presentTvPairingStatus,
  randomTvUserCode,
} from './tv-login-pairing';

describe('TV login pairing helpers', () => {
  it('normalizes manual TV codes without trusting spacing or casing', () => {
    expect(normalizeTvUserCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(formatTvUserCode('abcd2345')).toBe('ABCD-2345');
  });

  it('generates grouped eight-character TV codes', () => {
    expect(randomTvUserCode(() => 0)).toBe('AAAA-AAAA');
  });

  it('presents terminal pairing states before pending states', () => {
    const future = new Date('2026-01-01T00:10:00.000Z');
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(presentTvPairingStatus({ status: 'pending', expiresAt: future, approvedAt: null, consumedAt: null }, now)).toBe('pending');
    expect(presentTvPairingStatus({ status: 'pending', expiresAt: future, approvedAt: now, consumedAt: null }, now)).toBe('approved');
    expect(presentTvPairingStatus({ status: 'approved', expiresAt: future, approvedAt: now, consumedAt: now }, now)).toBe('consumed');
    expect(presentTvPairingStatus({ status: 'pending', expiresAt: now, approvedAt: null, consumedAt: null }, now)).toBe('expired');
  });
});
