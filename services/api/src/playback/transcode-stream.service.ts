import {
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdaptiveQualityPlan } from '@boltbytes/contracts';
import { createReadStream } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStreamToken } from './cast-stream-token';
import { isPathWithin, streamTokenMatches } from './direct-stream-policy';
import { applyMediaCors } from './media-cors';
import { isAllowedHlsAsset, rewriteHlsPlaylist } from './transcode-stream-policy';

type TranscodeLimits = {
  maxVideoResolution: number;
  maxVideoBitrate: number;
  preserveHdr: boolean;
  adaptiveQuality: AdaptiveQualityPlan;
  hdrMode: string;
};

@Injectable()
export class TranscodeStreamService {
  private readonly transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(sessionId: string, accountId: string, limits: TranscodeLimits) {
    await this.prisma.systemJob.create({
      data: {
        accountId,
        type: 'playback.transcode',
        status: 'queued',
        payload: {
          sessionId,
          maxVideoResolution: limits.maxVideoResolution,
          maxVideoBitrate: limits.maxVideoBitrate,
          preserveHdr: limits.preserveHdr,
          adaptiveQuality: limits.adaptiveQuality,
          hdrMode: limits.hdrMode,
        },
        maxAttempts: 1,
      },
    });
  }

  async status(sessionId: string, token: string | undefined) {
    const session = await this.validSession(sessionId, token);
    const manifestPath = this.assetPath(session.id, 'master.m3u8');
    try {
      const master = await readFile(manifestPath, 'utf8');
      const variants = master
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      if (variants.length === 0) throw new Error('HLS master has no variants');
      for (const variant of variants) {
        if (!isAllowedHlsAsset(variant) || !variant.endsWith('.m3u8')) {
          throw new Error('HLS master contains an invalid variant');
        }
        const playlist = await readFile(this.assetPath(session.id, variant), 'utf8');
        const firstSegment = playlist
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith('#'));
        if (!firstSegment || !isAllowedHlsAsset(firstSegment)) {
          throw new Error('HLS variant has no playable segment');
        }
        await access(this.assetPath(session.id, firstSegment));
      }
      return { state: 'ready', message: 'HLS stream is ready' };
    } catch {
      // The worker writes the manifest atomically after the first complete segment.
    }

    const job = await this.prisma.systemJob.findFirst({
      where: {
        accountId: session.accountId,
        type: 'playback.transcode',
        payload: { path: ['sessionId'], equals: session.id },
      },
      include: { attempts: { orderBy: { number: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return { state: 'failed', message: 'The transcode job was not found' };
    if (job.status === 'failed') {
      return {
        state: 'failed',
        message: job.attempts[0]?.error ?? 'FFmpeg could not prepare this media file',
      };
    }
    if (job.status === 'completed') {
      return { state: 'failed', message: 'FFmpeg completed without producing an HLS manifest' };
    }
    return {
      state: job.status === 'running' ? 'running' : 'queued',
      message: job.status === 'running' ? 'FFmpeg is preparing the stream' : 'Waiting for a transcoder',
    };
  }

  async sendAsset(
    sessionId: string,
    asset: string,
    token: string | undefined,
    origin: string | undefined,
    response: Response,
  ): Promise<void> {
    applyMediaCors(response, origin);
    const session = await this.validSession(sessionId, token);
    if (!isAllowedHlsAsset(asset)) {
      throw new NotFoundException({ code: 'hls_asset_missing', message: 'HLS asset was not found' });
    }
    const sessionRoot = await realpath(resolve(this.transcodeRoot, session.id)).catch(() => null);
    if (!sessionRoot || !isPathWithin(this.transcodeRoot, sessionRoot)) {
      throw new NotFoundException({ code: 'hls_not_ready', message: 'HLS stream is not ready' });
    }
    const candidate = this.assetPath(session.id, asset);
    const mediaPath = await realpath(candidate).catch(() => null);
    if (!mediaPath || !isPathWithin(sessionRoot, mediaPath)) {
      throw new NotFoundException({ code: 'hls_asset_missing', message: 'HLS asset was not found' });
    }

    if (asset.endsWith('.m3u8')) {
      const playlist = await readFile(mediaPath, 'utf8');
      response.status(200);
      response.setHeader('Content-Type', 'application/x-mpegURL');
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(rewriteHlsPlaylist(playlist, token!));
      return;
    }

    const fileStat = await stat(mediaPath);
    response.status(200);
    response.setHeader('Content-Type', 'video/mp2t');
    response.setHeader('Content-Length', String(fileStat.size));
    response.setHeader('Cache-Control', 'private, max-age=3600');
    await new Promise<void>((resolveStream, reject) => {
      const stream = createReadStream(mediaPath);
      stream.once('error', reject);
      response.once('finish', resolveStream);
      response.once('close', () => {
        stream.destroy();
        resolveStream();
      });
      stream.pipe(response);
    });
  }

  private assetPath(sessionId: string, asset: string): string {
    const candidate = resolve(this.transcodeRoot, sessionId, asset);
    if (!isPathWithin(this.transcodeRoot, candidate)) {
      throw new UnauthorizedException({ code: 'hls_path_invalid', message: 'HLS path escapes the transcode root' });
    }
    return candidate;
  }

  private async validSession(sessionId: string, token: string | undefined) {
    if (!token) throw new UnauthorizedException({ code: 'stream_token_required', message: 'Stream token is required' });
    const session = await this.prisma.playbackSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException({ code: 'stream_session_missing', message: 'Playback session was not found' });
    const streamToken = resolveStreamToken(sessionId, token, process.env.JWT_SECRET ?? '');
    if (!streamToken || !streamTokenMatches(streamToken, session.streamTokenHash)) {
      throw new UnauthorizedException({ code: 'stream_token_invalid', message: 'Stream token is invalid' });
    }
    if (!['reserving', 'active', 'paused'].includes(session.status) || session.leaseExpiresAt <= new Date()) {
      throw new GoneException({ code: 'stream_session_expired', message: 'Playback session has expired' });
    }
    if (session.method !== 'transcode') {
      throw new HttpException({ code: 'stream_method_invalid', message: 'This session does not use HLS transcoding' }, 409);
    }
    return session;
  }
}
