import { describe, expect, it } from 'vitest';
import { canalDigitalPositionFor, resolveDanishLiveTvPolicy } from '@boltbytes/contracts';

describe('Danish Live TV policy', () => {
  it('uses the Canal Digital position across quality and locale variants', () => {
    expect(canalDigitalPositionFor('DR 1 FHD DK')).toBe(1);
    expect(canalDigitalPositionFor('TV3+ HD')).toBe(8);
    expect(resolveDanishLiveTvPolicy({ name: 'DR 1 FHD DK', groupName: 'Denmark' })).toEqual({
      isDanish: true, lineupNumber: 1, sortOrder: 100,
    });
  });

  it('keeps foreign channels hidden unless their M3U metadata explicitly places them in Denmark', () => {
    expect(resolveDanishLiveTvPolicy({ name: 'NRK1 HD', groupName: 'Norway' }).isDanish).toBe(false);
    expect(resolveDanishLiveTvPolicy({ name: 'Eurosport 1 HD DK', countryCode: 'DK' }).isDanish).toBe(true);
  });

  it('places unknown Danish channels after the documented lineup', () => {
    expect(resolveDanishLiveTvPolicy({ name: 'Lokal TV DK', channelNumber: 42 })).toEqual({
      isDanish: true, lineupNumber: null, sortOrder: 90_042,
    });
  });
});
