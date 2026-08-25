export type DirectStreamAudioMode = 'copy' | 'aac';

export type DirectStreamHlsInput = {
  inputPath: string;
  variantPlaylistPath: string;
  segmentFilename: string;
  videoCodec: string | null;
  hasAudio: boolean;
  audioMode: DirectStreamAudioMode;
  audioStreamIndex?: number | null;
};

export function buildDirectStreamHlsArguments(input: DirectStreamHlsInput): string[] {
  const hevc = /^(?:hevc|h265|hev1|hvc1|x265)$/i.test(input.videoCodec?.trim() ?? '');
  const audioMap = input.audioStreamIndex === null || input.audioStreamIndex === undefined
    ? '0:a:0?'
    : `0:${input.audioStreamIndex}?`;
  return [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
    '-y',
    '-fflags', '+genpts',
    '-i', input.inputPath,
    '-map', '0:v:0',
    ...(input.hasAudio ? ['-map', audioMap] : []),
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-sn',
    '-dn',
    '-c:v', 'copy',
    ...(hevc ? ['-tag:v', 'hvc1'] : []),
    ...(input.hasAudio
      ? input.audioMode === 'aac'
        ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000']
        : ['-c:a', 'copy']
      : []),
    '-avoid_negative_ts', 'make_zero',
    '-max_muxing_queue_size', '4096',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init_0.mp4',
    '-hls_flags', 'split_by_time+temp_file',
    '-master_pl_publish_rate', '1',
    '-var_stream_map', input.hasAudio ? 'v:0,a:0,name:0' : 'v:0,name:0',
    '-master_pl_name', 'master.m3u8',
    '-hls_segment_filename', input.segmentFilename,
    input.variantPlaylistPath,
  ];
}
