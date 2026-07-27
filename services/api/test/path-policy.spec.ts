import { resolveLibraryPath } from '../src/catalog/path-policy';
import { describe, expect, it } from 'vitest';

describe('library path policy', () => {
  it('accepts descendants of the configured mount root', () => {
    expect(resolveLibraryPath('/media', 'movies/4k')).toBe('/media/movies/4k');
  });

  it('rejects traversal outside the mount root', () => {
    expect(resolveLibraryPath('/media', '../../etc')).toBeNull();
    expect(resolveLibraryPath('/media', '/../../etc/passwd')).toBeNull();
  });
});
