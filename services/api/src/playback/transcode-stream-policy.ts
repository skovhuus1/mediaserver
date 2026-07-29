const HLS_SEGMENT_PATTERN = /^(?:segment\d{5}|segment_\d+_\d{5})\.ts$/;
const HLS_STREAM_PATTERN = /^stream(?:_\d+)?\.m3u8$/;

export function isAllowedHlsAsset(asset: string): boolean {
  return asset === 'master.m3u8' || HLS_STREAM_PATTERN.test(asset) || HLS_SEGMENT_PATTERN.test(asset);
}

export function rewriteHlsPlaylist(playlist: string, token: string): string {
  const encodedToken = encodeURIComponent(token);
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const asset = line.trim();
      if (!asset || asset.startsWith('#')) return line;
      if (!isAllowedHlsAsset(asset) || asset === 'master.m3u8') {
        throw new Error(`Unexpected HLS playlist asset: ${asset}`);
      }
      return `${asset}?token=${encodedToken}`;
    })
    .join('\n');
}
