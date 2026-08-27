import {
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdaptiveQualityPlan } from '@boltbytes/contracts';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStreamToken } from './cast-stream-token';
import { isPathWithin, streamTokenMatches } from './direct-stream-policy';
import { applyMediaCors } from './media-cors';
import {
  hlsPlaylistSegments,
  hlsPlaylistInitializationAssets,
  isAllowedHlsAsset,
  isAllowedHlsGeneration,
  isHlsStartupBufferReady,
  resolveHlsStartupSegments,
  rewriteHlsPlaylist,
} from './transcode-stream-policy';

type TranscodeLimits = {
  streamMode: 'transcode' | 'direct_stream';
  audioMode?: 'copy' | 'aac';
  maxVideoResolution: number;
  maxVideoBitrate: number;
  preserveHdr: boolean;
  adaptiveQuality: AdaptiveQualityPlan;
  hdrMode: string;
  subtitleTrackId?: string | null;
  audioTrackId?: string | null;
  audioStreamIndex?: number | null;
  startPositionMs?: number;
  startupPolicy?: PlaybackStartupPolicy;
};

type PlaybackStartupPolicy = 'baseline_first' | 'stable';

@Injectable()
export class TranscodeStreamService {
  private readonly transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
  private readonly requiredStartupSegments = resolveHlsStartupSegments(process.env.BB_MEDIA_HLS_STARTUP_SEGMENTS);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(sessionId: string, accountId: string, limits: TranscodeLimits) {
    const generationId = randomUUID();
    await this.prisma.systemJob.create({
      data: {
        id: generationId,
        accountId,
        type: 'playback.transcode',
        status: 'queued',
        payload: {
          sessionId,
          generationId,
          streamMode: limits.streamMode,
          ...(limits.streamMode === 'direct_stream' ? { audioMode: limits.audioMode ?? 'copy' } : {}),
          maxVideoResolution: limits.maxVideoResolution,
          maxVideoBitrate: limits.maxVideoBitrate,
          preserveHdr: limits.preserveHdr,
          adaptiveQuality: limits.adaptiveQuality,
          hdrMode: limits.hdrMode,
          startupPolicy: limits.startupPolicy ?? 'stable',
          ...(limits.subtitleTrackId
            ? { subtitleTrackId: limits.subtitleTrackId }
            : {}),
          ...(limits.audioTrackId
            ? { audioTrackId: limits.audioTrackId }
            : {}),
          ...(typeof limits.audioStreamIndex === 'number'
            ? { audioStreamIndex: limits.audioStreamIndex }
            : {}),
          ...(limits.startPositionMs
            ? { startPositionMs: limits.startPositionMs }
            : {}),
        },
        maxAttempts: 1,
      },
    });
    return generationId;
  }

  async enqueueSubtitles(sessionId: string, accountId: string) {
    await this.prisma.systemJob.create({
      data: {
        accountId,
        type: 'playback.transcode',
        status: 'queued',
        payload: { sessionId, streamMode: 'subtitle_only' },
        maxAttempts: 1,
      },
    });
  }

  async status(sessionId: string, token: string | undefined, requestedGeneration?: string) {
    const session = await this.validSession(sessionId, token);
    const generation = this.requestedGeneration(requestedGeneration);
    const job = await this.prisma.systemJob.findFirst({
      where: {
        ...(generation ? { id: generation } : {}),
        accountId: session.accountId,
        type: 'playback.transcode',
        payload: { path: ['sessionId'], equals: session.id },
        NOT: { payload: { path: ['streamMode'], equals: 'subtitle_only' } },
      },
      include: { attempts: { orderBy: { number: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return { state: 'failed', message: 'The HLS preparation job was not found' };
    const jobGeneration = hlsJobGeneration(job.id, job.payload);
    const startupPolicy = hlsStartupPolicy(job.payload);
    const requiredStartupSegments = startupPolicy === 'baseline_first'
      ? 1
      : this.requiredStartupSegments;
    if (generation && generation !== jobGeneration) {
      return { state: 'failed', message: 'The requested HLS generation was not found' };
    }
    if (job.status === 'failed') {
      return {
        state: 'failed',
        message: job.attempts[0]?.error ?? 'FFmpeg could not prepare this media file',
      };
    }
    const manifestPath = this.assetPath(session.id, 'master.m3u8', jobGeneration);
    let readySegments = 0;
    let readyVariants = 0;
    let variantCount = 0;
    try {
      const master = await readFile(manifestPath, 'utf8');
      const variants = master
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      if (variants.length === 0) throw new Error('HLS master has no variants');
      variantCount = variants.length;
      const startupVariants = startupPolicy === 'baseline_first'
        ? variants.slice(0, 1)
        : variants;
      for (const variant of startupVariants) {
        if (!isAllowedHlsAsset(variant) || !variant.endsWith('.m3u8')) {
          throw new Error('HLS master contains an invalid variant');
        }
        const playlist = await readFile(this.assetPath(session.id, variant, jobGeneration), 'utf8');
        const segments = hlsPlaylistSegments(playlist);
        readySegments = readySegments === 0
          ? segments.length
          : Math.min(readySegments, segments.length);
        if (!isHlsStartupBufferReady(playlist, requiredStartupSegments)) {
          throw new Error('HLS variant does not have a stable startup buffer');
        }
        await Promise.all(
          [
            ...hlsPlaylistInitializationAssets(playlist),
            ...segments.slice(0, requiredStartupSegments),
          ].map((asset) => access(this.assetPath(session.id, asset, jobGeneration))),
        );
        readyVariants += 1;
      }
      return {
        state: 'ready',
        message: session.method === 'direct_stream' ? 'Direct Stream HLS is ready' : 'Transcoded HLS is ready',
        readySegments: requiredStartupSegments,
        requiredSegments: requiredStartupSegments,
        producerLeadMs: requiredStartupSegments * 4_000,
        startupPolicy,
        startupVariantIndex: 0,
        readyVariants,
        variantCount,
      };
    } catch {
      // The event playlists grow atomically while FFmpeg prepares a stable startup buffer.
    }

    if (job.status === 'completed') {
      return { state: 'failed', message: 'FFmpeg completed without producing an HLS manifest' };
    }
    return {
      state: job.status === 'running' ? 'running' : 'queued',
      message: job.status === 'running'
        ? session.method === 'direct_stream' ? 'FFmpeg is remuxing the stream' : 'FFmpeg is transcoding the stream'
        : 'Waiting for an HLS worker',
      readySegments: Math.min(readySegments, requiredStartupSegments),
      requiredSegments: requiredStartupSegments,
      producerLeadMs: readySegments * 4_000,
      startupPolicy,
      startupVariantIndex: 0,
      readyVariants,
      variantCount,
    };
  }

  async sendAsset(
    sessionId: string,
    asset: string,
    token: string | undefined,
    requestedGeneration: string | undefined,
    origin: string | undefined,
    response: Response,
  ): Promise<void> {
    applyMediaCors(response, origin);
    const session = await this.validSession(sessionId, token);
    let generation = this.requestedGeneration(requestedGeneration);
    if (!generation) {
      const latestJob = await this.prisma.systemJob.findFirst({
        where: {
          accountId: session.accountId,
          type: 'playback.transcode',
          payload: { path: ['sessionId'], equals: session.id },
          NOT: { payload: { path: ['streamMode'], equals: 'subtitle_only' } },
        },
        orderBy: { createdAt: 'desc' },
      });
      generation = latestJob ? hlsJobGeneration(latestJob.id, latestJob.payload) : null;
    }
    if (!isAllowedHlsAsset(asset)) {
      throw new NotFoundException({ code: 'hls_asset_missing', message: 'HLS asset was not found' });
    }
    const assetRootCandidate = resolve(this.transcodeRoot, session.id, ...(generation ? [generation] : []));
    const sessionRoot = await realpath(assetRootCandidate).catch(() => null);
    if (!sessionRoot || !isPathWithin(this.transcodeRoot, sessionRoot)) {
      throw new NotFoundException({ code: 'hls_not_ready', message: 'HLS stream is not ready' });
    }
    const candidate = this.assetPath(session.id, asset, generation);
    const mediaPath = await realpath(candidate).catch(() => null);
    if (!mediaPath || !isPathWithin(sessionRoot, mediaPath)) {
      throw new NotFoundException({ code: 'hls_asset_missing', message: 'HLS asset was not found' });
    }

    if (asset.endsWith('.m3u8')) {
      const playlist = await readFile(mediaPath, 'utf8');
      response.status(200);
      response.setHeader('Content-Type', 'application/x-mpegURL');
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(rewriteHlsPlaylist(playlist, token!, generation ?? undefined));
      return;
    }

    const fileStat = await stat(mediaPath);
    response.status(200);
    response.setHeader('Content-Type', asset.endsWith('.ts') ? 'video/mp2t' : 'video/mp4');
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

  private assetPath(sessionId: string, asset: string, generation: string | null = null): string {
    const candidate = resolve(this.transcodeRoot, sessionId, ...(generation ? [generation] : []), asset);
    if (!isPathWithin(this.transcodeRoot, candidate)) {
      throw new UnauthorizedException({ code: 'hls_path_invalid', message: 'HLS path escapes the transcode root' });
    }
    return candidate;
  }

  private requestedGeneration(value: string | undefined): string | null {
    if (value === undefined) return null;
    if (!isAllowedHlsGeneration(value)) {
      throw new UnauthorizedException({ code: 'hls_generation_invalid', message: 'HLS generation is invalid' });
    }
    return value;
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
    if (!['transcode', 'direct_stream'].includes(session.method)) {
      throw new HttpException({ code: 'stream_method_invalid', message: 'This session does not use HLS delivery' }, 409);
    }
    return session;
  }
}

function hlsJobGeneration(jobId: string, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return (payload as Record<string, unknown>).generationId === jobId ? jobId : null;
}

function hlsStartupPolicy(payload: unknown): PlaybackStartupPolicy {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'stable';
  return (payload as Record<string, unknown>).startupPolicy === 'baseline_first'
    ? 'baseline_first'
    : 'stable';
}
