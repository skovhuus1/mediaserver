import { describe, expect, it } from 'vitest';
import { isAllowedHlsAsset, rewriteHlsPlaylist } from '../src/playback/transcode-stream-policy';

describe('transcode stream policy', () => {
  it('allows only the generated manifest and numbered transport-stream segments', () => {
    expect(isAllowedHlsAsset('master.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('segment00001.ts')).toBe(true);
    expect(isAllowedHlsAsset('stream_2.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('segment_2_00001.ts')).toBe(true);
    expect(isAllowedHlsAsset('../secret')).toBe(false);
    expect(isAllowedHlsAsset('segment1.ts')).toBe(false);
  });

  it('adds the session token to every playlist segment', () => {
    const playlist = '#EXTM3U\n#EXTINF:4.0,\nsegment00000.ts\n#EXT-X-ENDLIST\n';
    expect(rewriteHlsPlaylist(playlist, 'token with spaces')).toContain(
      'segment00000.ts?token=token%20with%20spaces',
    );
  });

  it('rejects unexpected paths emitted into a playlist', () => {
    expect(() => rewriteHlsPlaylist('#EXTM3U\n../outside.ts\n', 'token')).toThrow(
      'Unexpected HLS playlist asset',
    );
  });
});
