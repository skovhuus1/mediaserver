import { describe, expect, it } from 'vitest';
import { imageSubtitleDescriptors } from '../src/playback/subtitle-stream.service';

describe('image subtitle descriptors', () => {
  it('exposes PGS and VobSub as burn-in tracks with stable stream ids', () => {
    expect(
      imageSubtitleDescriptors({
        streams: [
          {
            index: 4,
            codec_type: 'subtitle',
            codec_name: 'hdmv_pgs_subtitle',
            tags: { language: 'dan', title: 'Dansk' },
            disposition: { forced: 1 },
          },
          {
            index: 6,
            codec_type: 'subtitle',
            codec_name: 'dvd_subtitle',
            tags: { language: 'eng' },
          },
        ],
      }),
    ).toEqual([
      {
        streamIndex: 4,
        language: 'dan',
        label: 'Dansk (hdmv_pgs_subtitle)',
        forced: true,
      },
      {
        streamIndex: 6,
        language: 'eng',
        label: 'ENG (dvd_subtitle)',
        forced: false,
      },
    ]);
  });

  it('does not misclassify text subtitles as burn-in tracks', () => {
    expect(
      imageSubtitleDescriptors({
        streams: [
          { index: 2, codec_type: 'subtitle', codec_name: 'subrip' },
          { index: 3, codec_type: 'video', codec_name: 'hdmv_pgs_subtitle' },
        ],
      }),
    ).toEqual([]);
  });
});
