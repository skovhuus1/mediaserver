import { buildDirectStreamHlsArguments } from '@boltbytes/contracts';
import { describe, expect, it } from 'vitest';

describe('Direct Stream FFmpeg contract', () => {
  it('copies HEVC video, tags it as hvc1 and transcodes only unsupported audio', () => {
    const args = buildDirectStreamHlsArguments({
      inputPath: '/media/movie.mkv',
      variantPlaylistPath: '/transcode/session/stream_%v.m3u8',
      segmentFilename: '/transcode/session/segment_%v_%05d.m4s',
      videoCodec: 'hevc',
      hasAudio: true,
      audioMode: 'aac',
    });
    expect(option(args, '-c:v')).toBe('copy');
    expect(option(args, '-tag:v')).toBe('hvc1');
    expect(option(args, '-c:a')).toBe('aac');
    expect(option(args, '-hls_segment_type')).toBe('fmp4');
    expect(option(args, '-hls_fmp4_init_filename')).toBe('init_0.mp4');
    expect(option(args, '-hls_time')).toBe('2');
    expect(option(args, '-hls_flags')).toBe('split_by_time+temp_file');
    expect(option(args, '-hls_flags')).not.toContain('independent_segments');
    expect(args).toContain('0:a:0?');
    expect(args).not.toContain('libx264');
    expect(args).not.toContain('libx265');
  });

  it('copies already compatible H264 and AAC streams without either encoder', () => {
    const args = buildDirectStreamHlsArguments({
      inputPath: '/media/movie.mkv',
      variantPlaylistPath: '/transcode/session/stream_%v.m3u8',
      segmentFilename: '/transcode/session/segment_%v_%05d.m4s',
      videoCodec: 'h264',
      hasAudio: true,
      audioMode: 'copy',
    });
    expect(option(args, '-c:v')).toBe('copy');
    expect(option(args, '-c:a')).toBe('copy');
    expect(args).not.toContain('-tag:v');
    expect(option(args, '-var_stream_map')).toBe('v:0,a:0,name:0');
  });

  it('maps the requested audio stream index when switching audio tracks', () => {
    const args = buildDirectStreamHlsArguments({
      inputPath: '/media/movie.mkv',
      variantPlaylistPath: '/transcode/session/stream_%v.m3u8',
      segmentFilename: '/transcode/session/segment_%v_%05d.m4s',
      videoCodec: 'h264',
      hasAudio: true,
      audioMode: 'copy',
      audioStreamIndex: 2,
    });
    expect(args).toContain('0:2?');
    expect(args).not.toContain('0:a:0?');
  });
});

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
