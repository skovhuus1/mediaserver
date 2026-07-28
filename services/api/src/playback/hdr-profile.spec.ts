import { describe, expect, it } from 'vitest';
import { detectVideoSignalProfile, isHevcCodec } from '@boltbytes/contracts';

describe('HDR video profile', () => {
  it('detects HDR10 and ten-bit HEVC from ffprobe data', () => {
    expect(detectVideoSignalProfile({
      streams: [{
        codec_type: 'video',
        codec_name: 'hevc',
        pix_fmt: 'yuv420p10le',
        color_primaries: 'bt2020',
        color_transfer: 'smpte2084',
        color_space: 'bt2020nc',
      }],
    })).toEqual({
      codec: 'hevc',
      hdr: 'hdr10',
      bitDepth: 10,
      colorPrimaries: 'bt2020',
      colorTransfer: 'smpte2084',
      colorSpace: 'bt2020nc',
    });
  });

  it('distinguishes HLG and Dolby Vision and normalizes HEVC aliases', () => {
    expect(detectVideoSignalProfile({
      streams: [{ codec_type: 'video', codec_name: 'hevc', color_transfer: 'arib-std-b67' }],
    }).hdr).toBe('hlg');
    expect(detectVideoSignalProfile({
      streams: [{
        codec_type: 'video',
        codec_name: 'hevc',
        side_data_list: [{ side_data_type: 'DOVI configuration record' }],
      }],
    }).hdr).toBe('dolby_vision');
    expect(isHevcCodec('hvc1')).toBe(true);
  });
});
