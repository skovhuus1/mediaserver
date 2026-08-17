import { describe, expect, it } from 'vitest';
import {
  hlsPlaylistSegments,
  hlsPlaylistInitializationAssets,
  isAllowedHlsAsset,
  isHlsStartupBufferReady,
  resolveHlsStartupSegments,
  rewriteHlsPlaylist,
} from './transcode-stream-policy';

describe('transcode stream policy', () => {
  it('allows only the fixed master, variant and numbered segment assets', () => {
    expect(isAllowedHlsAsset('master.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('stream.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('stream_0.m3u8')).toBe(true);
    expect(isAllowedHlsAsset('segment00000.ts')).toBe(true);
    expect(isAllowedHlsAsset('segment_0_00000.ts')).toBe(true);
    expect(isAllowedHlsAsset('segment_0_00000.m4s')).toBe(true);
    expect(isAllowedHlsAsset('init_0.mp4')).toBe(true);
    expect(isAllowedHlsAsset('../stream.m3u8')).toBe(false);
    expect(isAllowedHlsAsset('../init_0.mp4')).toBe(false);
  });

  it('adds the stream token to both variant and segment references', () => {
    expect(rewriteHlsPlaylist('#EXTM3U\nstream.m3u8\n', 'a+b'))
      .toBe('#EXTM3U\nstream.m3u8?token=a%2Bb\n');
    expect(rewriteHlsPlaylist('#EXTM3U\nsegment00000.ts\n', 'token'))
      .toBe('#EXTM3U\nsegment00000.ts?token=token\n');
    expect(rewriteHlsPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init_0.mp4"\nsegment_0_00000.m4s\n', 'a+b'))
      .toBe('#EXTM3U\n#EXT-X-MAP:URI="init_0.mp4?token=a%2Bb"\nsegment_0_00000.m4s?token=a%2Bb\n');
    expect(() => rewriteHlsPlaylist('#EXTM3U\n#EXT-X-MAP:URI="../init.mp4"\n', 'token'))
      .toThrow('Unexpected HLS initialization asset');
  });

  it('counts fMP4 media segments and discovers only safe initialization assets', () => {
    const playlist = '#EXTM3U\n#EXT-X-MAP:URI="init_0.mp4"\nsegment_0_00000.m4s\nsegment_0_00001.m4s\n';
    expect(hlsPlaylistInitializationAssets(playlist)).toEqual(['init_0.mp4']);
    expect(hlsPlaylistSegments(playlist)).toEqual(['segment_0_00000.m4s', 'segment_0_00001.m4s']);
  });

  it('waits for a stable startup buffer while allowing completed short media', () => {
    const oneSegment = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT\nsegment_0_00000.ts\n';
    const threeSegments = `${oneSegment}segment_0_00001.ts\nsegment_0_00002.ts\n`;
    expect(hlsPlaylistSegments(threeSegments)).toEqual([
      'segment_0_00000.ts',
      'segment_0_00001.ts',
      'segment_0_00002.ts',
    ]);
    expect(isHlsStartupBufferReady(oneSegment, 3)).toBe(false);
    expect(isHlsStartupBufferReady(threeSegments, 3)).toBe(true);
    expect(isHlsStartupBufferReady(`${oneSegment}#EXT-X-ENDLIST\n`, 3)).toBe(true);
  });

  it('normalizes the configured startup segment count', () => {
    expect(resolveHlsStartupSegments(undefined)).toBe(3);
    expect(resolveHlsStartupSegments('5')).toBe(5);
    expect(resolveHlsStartupSegments('0')).toBe(1);
    expect(resolveHlsStartupSegments('99')).toBe(8);
    expect(resolveHlsStartupSegments('invalid')).toBe(3);
  });
});
