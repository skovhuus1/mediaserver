import { describe, expect, it } from 'vitest';
import {
  embeddedSubtitleDescriptors,
  decodeSubtitleBuffer,
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
      hearingImpaired: false,
      default: false,
    });
    expect(sidecarSubtitleDescriptor('Movie (2026).mkv', 'Another Movie.da.srt')).toBeNull();
  });

  it('normalizes sidecar language names, locale tags and accessibility qualifiers', () => {
    expect(sidecarSubtitleDescriptor('Show.S01E01.mkv', 'Show S01E01 da-DK SDH.vtt')).toEqual({
      language: 'da',
      label: 'Dansk (hørehæmmede)',
      format: 'vtt',
      forced: false,
      hearingImpaired: true,
      default: false,
    });
    expect(sidecarSubtitleDescriptor('Show.S01E01.mkv', 'Dansk.forced.srt')).toBeNull();
    expect(sidecarSubtitleDescriptor('Show.S01E01.mkv', 'Dansk.forced.srt', {
      allowLanguageOnly: true,
    })).toEqual({
      language: 'da',
      label: 'Dansk (tvungen)',
      format: 'srt',
      forced: true,
      hearingImpaired: false,
      default: false,
    });
  });

  it('converts SRT timestamps to valid WebVTT', () => {
    expect(subtitleToWebVtt('1\r\n00:00:00,100 --> 00:00:01,200\r\nHej\r\n', 'srt'))
      .toBe('WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.200\nHej\n');
  });

  it('decodes UTF-16 and Windows-1252 subtitle files without losing Danish letters', () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ÆØÅ', 'utf16le')]);
    expect(decodeSubtitleBuffer(utf16)).toBe('ÆØÅ');
    expect(decodeSubtitleBuffer(Buffer.from([0xc6, 0xd8, 0xc5]))).toBe('ÆØÅ');
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
      hearingImpaired: false,
      default: false,
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
      hearingImpaired: false,
      default: false,
    }]);
  });

  it('normalizes embedded subtitle title metadata when language tags are weak', () => {
    expect(embeddedSubtitleDescriptors({
      streams: [{
        index: 8,
        codec_type: 'subtitle',
        codec_name: 'webvtt',
        tags: { title: 'Danish SDH Forced' },
      }],
    })).toEqual([{
      streamIndex: 8,
      language: 'da',
      label: 'Dansk (tvungen, hørehæmmede)',
      forced: true,
      hearingImpaired: true,
      default: false,
    }]);
  });
});
