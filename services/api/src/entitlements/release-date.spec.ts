import { describe, expect, it } from 'vitest';
import { releaseDateForEntitlement } from './entitlement-engine';

describe('releaseDateForEntitlement', () => {
  it('preserves an exact provider release date', () => {
    const exact = new Date('2026-07-12T00:00:00.000Z');
    expect(releaseDateForEntitlement(exact, 2025)).toBe(exact);
  });

  it('uses the first day of a scanner-derived release year', () => {
    expect(releaseDateForEntitlement(null, 2026)?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps media without any credible release information blocked', () => {
    expect(releaseDateForEntitlement(null, null)).toBeNull();
    expect(releaseDateForEntitlement(null, 1200)).toBeNull();
  });
});
