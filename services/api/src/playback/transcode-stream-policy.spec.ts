import { describe, expect, it } from 'vitest';
import { isAllowedHlsAsset, rewriteHlsPlaylist } from './transcode-stream-policy';

describe('transcode stream policy', () => {
  it('allows only the fixed master, variant and numbered segment assets', () => {
    expect(isAllowedHlsAsset('master.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('stream.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('stream_0.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('segment00000.ts')).toBe(true);
    expect(isAllowedHlsAsset('segment_0_00000.ts')).toBe(true);
    expect(isAllowedHlsAsset('../stream.m3u8')).toBe(false);
  });

  it('adds the stream token to both variant and segment references', () => {
    expect(rewriteHlsPlaylist('#EXTM3U\nstream.m3u8\n', 'a+b'))
      .toBe('#EXTM3U\nstream.m3u8?token=a%2Bb\n');
    expect(rewriteHlsPlaylist('#EXTM3U\nsegment00000.ts\n', 'token'))
      .toBe('#EXTM3U\nsegment00000.ts?token=token\n');
  });
});
