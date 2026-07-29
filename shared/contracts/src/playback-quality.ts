export type PlaybackQualityPresentation = {
  resolution: string;
  bitrate: string | null;
  dynamicRange: 'HDR' | 'SDR' | null;
  upscaled: boolean;
};

export function normalizePlaybackQualitySelection(
  requestedLevel: number,
  levelCount: number,
): number {
  if (requestedLevel === -1) return -1;
  if (!Number.isInteger(requestedLevel) || requestedLevel < 0 || requestedLevel >= levelCount) {
    return -1;
  }
  return requestedLevel;
}

export function presentPlaybackQualityLevel(
  height: number,
  bitrate: number,
  rendition?: { hdr: boolean; upscaled: boolean },
): PlaybackQualityPresentation {
  return {
    resolution: height > 0 ? (height === 2160 ? '4K' : `${height}p`) : 'Transcoded',
    bitrate: bitrate > 0 ? `${(bitrate / 1_000_000).toFixed(1)} Mbps` : null,
    dynamicRange: rendition ? (rendition.hdr ? 'HDR' : 'SDR') : null,
    upscaled: rendition?.upscaled ?? false,
  };
}
