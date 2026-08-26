import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageSubtitleDescriptors, SubtitleStreamService } from '../src/playback/subtitle-stream.service';

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
        language: 'da',
        label: 'Dansk (hdmv_pgs_subtitle)',
        forced: true,
      },
      {
        streamIndex: 6,
        language: 'en',
        label: 'Engelsk (dvd_subtitle)',
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

  it('discovers language-only sidecars in dedicated subtitle folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bb-media-subtitles-'));
    try {
      await writeFile(join(root, 'Show.S01E01.mkv'), '');
      await mkdir(join(root, 'Subtitles'));
      await writeFile(join(root, 'Subtitles', 'Dansk.forced.srt'), '1\n00:00:00,000 --> 00:00:01,000\nHej\n');
      const service = new SubtitleStreamService({} as never);
      await expect(service.listForPlayback('session-1', 'token-1', {
        relativePath: 'Show.S01E01.mkv',
        probe: { streams: [] },
        storageRoot: { mountPath: root },
      }, false)).resolves.toEqual([
        expect.objectContaining({
          id: 'sidecar-0',
          language: 'da',
          label: 'Dansk (tvungen)',
          forced: true,
          src: '/api/v1/playback/sessions/session-1/subtitles/sidecar-0.vtt?token=token-1',
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
