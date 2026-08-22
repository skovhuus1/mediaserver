import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decryptSecret } from '../system/secret-value';
import { LiveTvPlaybackService } from './live-tv-playback.service';
import { openLiveTvTarget, rewriteLiveTvHlsPlaylist, sealLiveTvTarget } from './live-tv-stream-security';

export type LiveTvStreamResult = { status: number; headers: Record<string, string>; body: Buffer | NodeJS.ReadableStream };

@Injectable()
export class LiveTvStreamService {
  private readonly root = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode', 'live-tv');
  constructor(private readonly playback: LiveTvPlaybackService) {}

  async direct(leaseId: string, token: string | undefined) {
    const { source } = await this.playback.sourceForStream(leaseId, token);
    return this.upstream(leaseId, token!, decryptSecret(source.encryptedStreamUrl));
  }

  async proxy(leaseId: string, token: string | undefined, sealed: string | undefined) {
    await this.playback.sourceForStream(leaseId, token);
    const target = sealed ? openLiveTvTarget(sealed, leaseId) : null;
    if (!target) throw new BadRequestException({ code: 'live_tv_proxy_target_invalid', message: 'Den signerede upstream-adresse er ugyldig eller udløbet' });
    return this.upstream(leaseId, token!, target);
  }

  async manifest(leaseId: string, token: string | undefined): Promise<LiveTvStreamResult> {
    const { lease } = await this.playback.sourceForStream(leaseId, token);
    if (lease.method === 'direct_play') return this.direct(leaseId, token);
    if (!['ready', 'active'].includes(lease.status)) {
      if (lease.status === 'failed') throw new BadGatewayException({ code: 'live_tv_transcode_failed', message: lease.lastError ?? 'Live TV-transcoding fejlede' });
      throw new HttpException({ code: 'live_tv_stream_preparing', message: 'FFmpeg forbereder Live TV-streamen' }, 425);
    }
    const path = resolve(this.root, leaseId, 'index.m3u8');
    await this.safeFile(path, leaseId);
    const playlist = await readFile(path, 'utf8');
    const base = `${publicBaseUrl()}/api/v1/live-tv/stream/${leaseId}/hls`;
    const rewritten = playlist.replace(/^([^#\r\n][^\r\n]*)$/gm, (file) => `${base}/${encodeURIComponent(file.trim())}?token=${encodeURIComponent(token!)}`);
    return { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }, body: Buffer.from(rewritten) };
  }

  async hlsFile(leaseId: string, token: string | undefined, file: string): Promise<LiveTvStreamResult> {
    await this.playback.sourceForStream(leaseId, token);
    if (!/^[A-Za-z0-9._-]+$/.test(file)) throw new BadRequestException({ code: 'live_tv_hls_path_invalid', message: 'HLS-filnavnet er ugyldigt' });
    const path = resolve(this.root, leaseId, file);
    const details = await this.safeFile(path, leaseId);
    return { status: 200, headers: {
      'content-type': file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : file.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream',
      'content-length': String(details.size), 'cache-control': file.endsWith('.m3u8') ? 'no-store' : 'private, max-age=30',
    }, body: createReadStream(path) };
  }

  private async upstream(leaseId: string, token: string, target: string): Promise<LiveTvStreamResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try { response = await fetch(target, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'BoltBytes-Media/1.0', accept: '*/*' } }); }
    catch (error) { throw new BadGatewayException({ code: 'live_tv_upstream_unavailable', message: `Live TV-kilden svarede ikke: ${error instanceof Error ? error.message : 'ukendt fejl'}` }); }
    finally { clearTimeout(timer); }
    if (!response.ok || !response.body) throw new BadGatewayException({ code: 'live_tv_upstream_error', message: `Live TV-kilden svarede HTTP ${response.status}` });
    const contentType = response.headers.get('content-type') ?? '';
    const isPlaylist = /mpegurl/i.test(contentType) || new URL(target).pathname.toLowerCase().endsWith('.m3u8');
    if (isPlaylist) {
      const text = await response.text();
      const base = `${publicBaseUrl()}/api/v1/live-tv/stream/${leaseId}/proxy?token=${encodeURIComponent(token)}&target=`;
      const rewritten = rewriteLiveTvHlsPlaylist(text, response.url || target, (url) => `${base}${encodeURIComponent(sealLiveTvTarget({ leaseId, url, expiresAt: Date.now() + 10 * 60_000 }))}`);
      return { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }, body: Buffer.from(rewritten) };
    }
    return { status: response.status, headers: {
      'content-type': contentType || 'application/octet-stream', 'cache-control': 'no-store',
      ...(response.headers.get('content-length') ? { 'content-length': response.headers.get('content-length')! } : {}),
    }, body: createNodeStream(response.body) };
  }

  private async safeFile(path: string, leaseId: string) {
    const root = resolve(this.root, leaseId);
    if (path !== root && !path.startsWith(`${root}\\`) && !path.startsWith(`${root}/`)) throw new BadRequestException({ code: 'live_tv_hls_path_invalid', message: 'HLS-stien forlader sessionens mappe' });
    try { return await stat(path); } catch { throw new NotFoundException({ code: 'live_tv_hls_file_missing', message: 'HLS-filen er endnu ikke klar' }); }
  }
}

function createNodeStream(body: ReadableStream<Uint8Array>) {
  return Readable.fromWeb(body as never);
}
function publicBaseUrl() { return (process.env.BB_MEDIA_PUBLIC_URL?.trim() || '').replace(/\/$/, ''); }
import { Readable } from 'node:stream';
