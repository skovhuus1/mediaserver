import { decryptSecret, encryptSecret } from '../system/secret-value';

type SealedTarget = { leaseId: string; url: string; expiresAt: number };

export function sealLiveTvTarget(target: SealedTarget, key?: string): string {
  return Buffer.from(JSON.stringify(encryptSecret(JSON.stringify(target), key)), 'utf8').toString('base64url');
}

export function openLiveTvTarget(token: string, leaseId: string, now = Date.now(), key?: string): string | null {
  try {
    const encrypted = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as unknown;
    const target = JSON.parse(decryptSecret(encrypted, key)) as SealedTarget;
    if (target.leaseId !== leaseId || target.expiresAt <= now || !/^https?:\/\//i.test(target.url)) return null;
    return target.url;
  } catch {
    return null;
  }
}

export function rewriteLiveTvHlsPlaylist(
  playlist: string,
  playlistUrl: string,
  rewrite: (absoluteUrl: string) => string,
): string {
  return playlist.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (!line.startsWith('#')) return rewrite(new URL(line.trim(), playlistUrl).toString());
    return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewrite(new URL(uri, playlistUrl).toString())}"`);
  }).join('\n');
}
