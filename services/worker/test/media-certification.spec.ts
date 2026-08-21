import { describe, expect, it } from 'vitest';
import {
  buildCertificationCoverage,
  classifyMediaProbe,
  mediaCertificationSignature,
  selectCertificationSamples,
  type CertificationCandidate,
} from '../src/media-certification.js';

function candidate(
  fileId: string,
  probe: unknown,
  fallback: Parameters<typeof classifyMediaProbe>[1] = {},
): CertificationCandidate {
  const summary = classifyMediaProbe(probe, fallback);
  return {
    fileId,
    mediaId: `media-${fileId}`,
    title: fileId,
    mediaType: 'movie',
    relativePath: `${fileId}.mkv`,
    storageLabel: 'Media',
    storageMountPath: '/media',
    durationMs: 60_000,
    sizeBytes: 1_000,
    summary,
    signature: mediaCertificationSignature(summary),
  };
}

describe('media compatibility certification', () => {
  it('classifies container, HDR, codecs and subtitle delivery types', () => {
    const summary = classifyMediaProbe({
      format: { format_name: 'matroska,webm' },
      streams: [
        {
          index: 0,
          codec_type: 'video',
          codec_name: 'hevc',
          width: 3840,
          height: 2160,
          pix_fmt: 'yuv420p10le',
          color_transfer: 'smpte2084',
          color_primaries: 'bt2020',
        },
        { index: 1, codec_type: 'audio', codec_name: 'eac3' },
        { index: 2, codec_type: 'subtitle', codec_name: 'subrip' },
        { index: 3, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' },
      ],
    });

    expect(summary).toMatchObject({
      container: 'mkv',
      videoCodec: 'hevc',
      resolution: '2160p',
      hdr: 'hdr10',
      bitDepth: 10,
      audioCodecs: ['eac3'],
      subtitleCodecs: ['hdmv_pgs_subtitle', 'subrip'],
    });
    expect(summary.streams.find((stream) => stream.index === 2)?.subtitleKind).toBe('text');
    expect(summary.streams.find((stream) => stream.index === 3)?.subtitleKind).toBe('image');
  });

  it('builds complete inventory coverage and selects diverse samples', () => {
    const h264 = candidate('h264', {
      format: { format_name: 'mov,mp4' },
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
        { index: 1, codec_type: 'audio', codec_name: 'aac' },
      ],
    });
    const hevc = candidate('hevc', {
      format: { format_name: 'matroska' },
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160 },
        { index: 1, codec_type: 'audio', codec_name: 'truehd' },
        { index: 2, codec_type: 'subtitle', codec_name: 'ass' },
      ],
    });
    const duplicate = { ...h264, fileId: 'h264-2', relativePath: 'h264-2.mp4' };

    expect(buildCertificationCoverage([h264, hevc, duplicate])).toMatchObject({
      containers: { mp4: 2, mkv: 1 },
      videoCodecs: { h264: 2, hevc: 1 },
      audioCodecs: { aac: 2, truehd: 1 },
      subtitleCodecs: { ass: 1 },
    });
    const selected = selectCertificationSamples([h264, hevc, duplicate], 2);
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((item) => item.summary.videoCodec)))
      .toEqual(new Set(['h264', 'hevc']));
  });

  it('uses scanner fallbacks when legacy probe fields are incomplete', () => {
    expect(classifyMediaProbe({}, {
      container: 'mp4',
      videoCodec: 'avc1',
      width: 1280,
      height: 720,
    })).toMatchObject({
      container: 'mp4',
      videoCodec: 'h264',
      resolution: '720p',
      hdr: 'sdr',
    });
  });
});
