import { describe, expect, it } from 'vitest';
import {
  embeddedSubtitleDescriptors,
  sidecarSubtitleDescriptor,
  subtitleToWebVtt,
} from './subtitle-stream-policy';

describe('subtitle stream policy', () => {
  it('discovers matching sidecar names and rejects another movie', () => {
    expect(sidecarSubtitleDescriptor('Movie (2026).mkv', 'Movie (2026).da.forced.srt')).toEqual({
      language: 'da',
      label: 'Dansk (tvungen)',
      format: 'srt',
      forced: true,
    });
    expect(sidecarSubtitleDescriptor('Movie (2026).mkv', 'Another Movie.da.srt')).toBeNull();
  });

  it('converts SRT timestamps to valid WebVTT', () => {
    expect(subtitleToWebVtt('1\r\n00:00:00,100 --> 00:00:01,200\r\nHej\r\n', 'srt'))
      .toBe('WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.200\nHej\n');
  });

  it('only exposes embedded text subtitle codecs', () => {
    expect(embeddedSubtitleDescriptors({
      streams: [
        { index: 2, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'dan' } },
        { index: 3, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'eng' } },
      ],
    })).toEqual([{
      streamIndex: 2,
      language: 'da',
      label: 'Dansk',
      forced: false,
    }]);
  });

  it('exposes forced disposition for embedded text tracks', () => {
    expect(embeddedSubtitleDescriptors({
      streams: [{
        index: 7,
        codec_type: 'subtitle',
        codec_name: 'ass',
        tags: { language: 'eng' },
        disposition: { forced: 1 },
      }],
    })).toEqual([{
      streamIndex: 7,
      language: 'en',
      label: 'Engelsk (tvungen)',
      forced: true,
    }]);
  });
});
