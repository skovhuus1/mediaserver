const HLS_SEGMENT_PATTERN = /^(?:segment\d{5}|segment_\d+_\d{5})\.(?:ts|m4s)$/;
const HLS_STREAM_PATTERN = /^stream(?:_\d+)?\.m3u8$/;
const HLS_INIT_PATTERN = /^init_\d+\.mp4$/;

export function isAllowedHlsAsset(asset: string): boolean {
  return asset === 'master.m3u8'
    || HLS_STREAM_PATTERN.test(asset)
    || HLS_SEGMENT_PATTERN.test(asset)
    || HLS_INIT_PATTERN.test(asset);
}

export function hlsPlaylistInitializationAssets(playlist: string): string[] {
  return playlist
    .split(/\r?\n/)
    .map((line) => /^#EXT-X-MAP:.*\bURI="([^"]+)"/.exec(line.trim())?.[1] ?? null)
    .filter((asset): asset is string => asset !== null && HLS_INIT_PATTERN.test(asset));
}

export function hlsPlaylistSegments(playlist: string): string[] {
  return playlist
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => HLS_SEGMENT_PATTERN.test(line));
}

export function isHlsStartupBufferReady(playlist: string, requiredSegments: number): boolean {
  const segments = hlsPlaylistSegments(playlist);
  return segments.length >= requiredSegments
    || (segments.length > 0 && playlist.split(/\r?\n/).some((line) => line.trim() === '#EXT-X-ENDLIST'));
}

export function resolveHlsStartupSegments(rawValue: string | undefined): number {
  const normalized = rawValue?.trim() ?? '';
  if (!/^\d+$/.test(normalized)) return 3;
  return Math.max(1, Math.min(8, Number(normalized)));
}

export function rewriteHlsPlaylist(playlist: string, token: string): string {
  const encodedToken = encodeURIComponent(token);
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const asset = line.trim();
      if (!asset) return line;
      if (asset.startsWith('#')) {
        const map = /^(#EXT-X-MAP:.*\bURI=")([^"]+)(".*)$/.exec(asset);
        if (!map) return line;
        if (!HLS_INIT_PATTERN.test(map[2]!)) {
          throw new Error(`Unexpected HLS initialization asset: ${map[2]}`);
        }
        return `${map[1]}${map[2]}?token=${encodedToken}${map[3]}`;
      }
      if (!isAllowedHlsAsset(asset) || asset === 'master.m3u8') {
        throw new Error(`Unexpected HLS playlist asset: ${asset}`);
      }
      return `${asset}?token=${encodedToken}`;
    })
    .join('\n');
}
