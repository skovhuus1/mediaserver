import { describe, expect, it } from 'vitest';
import { openLiveTvTarget, rewriteLiveTvHlsPlaylist, sealLiveTvTarget } from './live-tv-stream-security';

const key = `base64:${Buffer.alloc(32, 9).toString('base64')}`;

describe('Live TV stream security', () => {
  it('encrypts a nested upstream URL and binds it to lease and expiry', () => {
    const token = sealLiveTvTarget({ leaseId: 'lease-1', url: 'https://provider.test/user/pass/segment.ts', expiresAt: 2_000 }, key);
    expect(token).not.toContain('provider');
    expect(openLiveTvTarget(token, 'lease-1', 1_000, key)).toBe('https://provider.test/user/pass/segment.ts');
    expect(openLiveTvTarget(token, 'lease-2', 1_000, key)).toBeNull();
    expect(openLiveTvTarget(token, 'lease-1', 2_001, key)).toBeNull();
  });

  it('rewrites segments, child manifests and key URIs', () => {
    const output = rewriteLiveTvHlsPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nvideo/720.m3u8', 'https://tv.test/live/master.m3u8', (url) => `/proxy?u=${encodeURIComponent(url)}`);
    expect(output).toContain('/proxy?u=https%3A%2F%2Ftv.test%2Flive%2Fkey.bin');
    expect(output).toContain('/proxy?u=https%3A%2F%2Ftv.test%2Flive%2Fvideo%2F720.m3u8');
  });
});
