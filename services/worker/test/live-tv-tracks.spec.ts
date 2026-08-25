import { describe, expect, it } from 'vitest';
import { defaultAudioTrack, findLiveTvTrack, isBitmapSubtitle, parseLiveTvProbe } from '../src/live-tv-tracks.js';

describe('Live TV track discovery', () => {
  it('builds stable audio and subtitle track ids from absolute stream indexes', () => {
    const catalog = parseLiveTvProbe({ streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264' },
      { index: 2, codec_type: 'audio', codec_name: 'aac', tags: { language: 'dan', title: 'Dansk' }, disposition: { default: 1 } },
      { index: 4, codec_type: 'audio', codec_name: 'aac', tags: { language: 'eng' }, disposition: { default: 0 } },
      { index: 5, codec_type: 'subtitle', codec_name: 'dvb_subtitle', tags: { language: 'dan' }, disposition: { forced: 0 } },
    ] });
    expect(catalog.audio.map((track) => track.id)).toEqual(['audio:2', 'audio:4']);
    expect(catalog.subtitles[0]).toMatchObject({ id: 'subtitle:5', language: 'da', codec: 'dvb_subtitle' });
    expect(defaultAudioTrack(catalog)?.id).toBe('audio:2');
    expect(findLiveTvTrack(catalog, 'audio', 'audio:4')?.streamIndex).toBe(4);
  });

  it('rejects unknown ids and identifies bitmap subtitle codecs', () => {
    const catalog = parseLiveTvProbe({ streams: [] });
    expect(findLiveTvTrack(catalog, 'subtitle', 'subtitle:99')).toBeNull();
    expect(isBitmapSubtitle('hdmv_pgs_subtitle')).toBe(true);
    expect(isBitmapSubtitle('subrip')).toBe(false);
  });
});

