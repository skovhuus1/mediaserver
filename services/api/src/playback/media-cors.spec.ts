import { describe, expect, it } from 'vitest';
import { normalizedMediaOrigin } from './media-cors';

describe('media CORS policy', () => {
  it('reflects one exact HTTP or HTTPS origin', () => {
    expect(normalizedMediaOrigin('https://cast.example.test')).toBe('https://cast.example.test');
    expect(normalizedMediaOrigin('http://192.0.2.10:6555')).toBe('http://192.0.2.10:6555');
  });

  it('rejects malformed origins and origins containing a path', () => {
    expect(normalizedMediaOrigin('https://cast.example.test/path')).toBeNull();
    expect(normalizedMediaOrigin('javascript:alert(1)')).toBeNull();
  });
});
