export type HdrProfile = 'hdr10' | 'hlg' | 'dolby_vision';

export type VideoSignalProfile = {
  codec: string | null;
  hdr: HdrProfile | null;
  bitDepth: number | null;
  colorPrimaries: string | null;
  colorTransfer: string | null;
  colorSpace: string | null;
};

export function detectVideoSignalProfile(probe: unknown): VideoSignalProfile {
  const root = asObject(probe);
  const streams = Array.isArray(root.streams) ? root.streams.map(asObject) : [];
  const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  const sideData = Array.isArray(video.side_data_list) ? video.side_data_list.map(asObject) : [];
  const codec = stringValue(video.codec_name);
  const colorPrimaries = stringValue(video.color_primaries);
  const colorTransfer = stringValue(video.color_transfer);
  const colorSpace = stringValue(video.color_space);
  const pixelFormat = stringValue(video.pix_fmt);
  const explicitBitDepth = integerValue(video.bits_per_raw_sample) ?? integerValue(video.bits_per_sample);
  const pixelDepth = pixelFormat?.match(/(?:p|gbrp)(10|12|14|16)(?:le|be)?$/i);
  const bitDepth = explicitBitDepth ?? (pixelDepth ? Number.parseInt(pixelDepth[1]!, 10) : pixelFormat ? 8 : null);
  const hasDolbyVision = sideData.some((entry) => (
    stringValue(entry.side_data_type)?.toLowerCase().includes('dovi')
    || stringValue(entry.side_data_type)?.toLowerCase().includes('dolby vision')
  )) || ['dvh1', 'dvhe'].includes(stringValue(video.codec_tag_string)?.toLowerCase() ?? '');

  let hdr: HdrProfile | null = null;
  if (hasDolbyVision) hdr = 'dolby_vision';
  else if (colorTransfer?.toLowerCase() === 'arib-std-b67') hdr = 'hlg';
  else if (
    colorTransfer?.toLowerCase() === 'smpte2084'
    || (colorPrimaries?.toLowerCase() === 'bt2020' && (bitDepth ?? 0) >= 10)
  ) hdr = 'hdr10';

  return { codec, hdr, bitDepth, colorPrimaries, colorTransfer, colorSpace };
}

export function isHevcCodec(codec: string | null | undefined): boolean {
  return ['h265', 'hevc', 'hev1', 'hvc1'].includes(codec?.toLowerCase() ?? '');
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}
