import { describe, expect, it } from 'vitest';
import { hostDisplayPath, resolveStorageBrowsePath } from '../src/setup/storage-path';

describe('storage directory browser path policy', () => {
  it('allows the mount root and nested directories', () => {
    expect(resolveStorageBrowsePath('/media', '/media')).toBe('/media');
    expect(resolveStorageBrowsePath('/media', '/media/Film/Action')).toBe('/media/Film/Action');
    expect(resolveStorageBrowsePath('/media', 'Serier/Drama')).toBe('/media/Serier/Drama');
  });

  it('rejects traversal and sibling-prefix paths', () => {
    expect(resolveStorageBrowsePath('/media', '/media/../etc')).toBeNull();
    expect(resolveStorageBrowsePath('/media', '/media-private')).toBeNull();
    expect(resolveStorageBrowsePath('/media', '/etc')).toBeNull();
  });

  it('maps the internal selection back to the configured host path', () => {
    expect(
      hostDisplayPath(
        '/home/seeds/Media/Films/user/google/google/external/Media',
        '/media',
        '/media/Film/Action',
      ),
    ).toBe('/home/seeds/Media/Films/user/google/google/external/Media/Film/Action');
  });
});
