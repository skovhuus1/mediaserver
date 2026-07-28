const HLS_SEGMENT_PATTERN = /^segment\d{5}\.ts$/;

export function isAllowedHlsAsset(asset: string): boolean {
  return asset === 'master.m3u8' || asset === 'stream.m3u8' || HLS_SEGMENT_PATTERN.test(asset);
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
