import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseTvdbEpisodeOrders, resolveTvdbEpisodeOrder } from './metadata-provider';

describe('TVDB episode orders', () => {
  it('keeps the default and provider-advertised order keys without inventing values', () => {
    expect(parseTvdbEpisodeOrders([
      { type: 'official', name: 'Aired Order' },
      { type: 'dvd', name: 'DVD Order' },
      { type: 'dvd', name: 'Duplicate' },
      { type: '../../unsafe', name: 'Unsafe' },
    ])).toEqual([
      { key: 'default', label: 'Seriens standardorden' },
      { key: 'official', label: 'Aired Order' },
      { key: 'dvd', label: 'DVD Order' },
    ]);
  });

  it('accepts only an order advertised by the selected series', () => {
    const orders = parseTvdbEpisodeOrders([{ type: 'absolute', name: 'Absolute Order' }]);
    expect(resolveTvdbEpisodeOrder(orders, 'absolute')).toBe('absolute');
    expect(() => resolveTvdbEpisodeOrder(orders, 'dvd')).toThrow(BadRequestException);
  });
});
