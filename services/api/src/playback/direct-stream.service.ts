import { GoneException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isPathWithin, mediaContentType, parseByteRange, streamTokenMatches } from './direct-stream-policy';
import { applyMediaCors } from './media-cors';

@Injectable()
export class DirectStreamService {
  constructor(private readonly prisma: PrismaService) {}

  async send(
    sessionId: string,
    token: string | undefined,
    rangeHeader: string | undefined,
    origin: string | undefined,
    response: Response,
    headOnly: boolean,
  ): Promise<void> {
    applyMediaCors(response, origin);
    if (!token) throw new UnauthorizedException({ code: 'stream_token_required', message: 'Stream token is required' });
    const session = await this.prisma.playbackSession.findUnique({
      where: { id: sessionId },
      include: {
        media: {
          include: {
            file: { include: { storageRoot: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException({ code: 'stream_session_missing', message: 'Playback session was not found' });
    if (!streamTokenMatches(token, session.streamTokenHash)) {
      throw new UnauthorizedException({ code: 'stream_token_invalid', message: 'Stream token is invalid' });
    }
    if (!['reserving', 'active', 'paused'].includes(session.status) || session.leaseExpiresAt <= new Date()) {
      throw new GoneException({ code: 'stream_session_expired', message: 'Playback session has expired' });
    }
    if (!['direct_play', 'direct_stream'].includes(session.method)) {
      throw new HttpException({ code: 'stream_method_invalid', message: 'This session does not use direct file delivery' }, 409);
    }
    const file = session.media.file;
    if (!file || file.status !== 'ready') {
      throw new NotFoundException({ code: 'media_file_unavailable', message: 'Scanned media file is unavailable' });
    }

    const rootPath = await realpath(file.storageRoot.mountPath);
    const candidate = resolve(rootPath, ...file.relativePath.split('/'));
    const mediaPath = await realpath(candidate);
    if (!isPathWithin(rootPath, mediaPath)) {
      throw new UnauthorizedException({ code: 'media_path_invalid', message: 'Resolved media path escapes its storage root' });
    }
    const fileStat = await stat(mediaPath);
    if (!fileStat.isFile()) throw new NotFoundException({ code: 'media_file_unavailable', message: 'Media path is not a file' });
    const size = fileStat.size;
    let range;
    try {
      range = parseByteRange(rangeHeader, size);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      response.setHeader('Content-Range', `bytes */${size}`);
      throw new HttpException({ code: 'invalid_byte_range', message: error.message }, 416);
    }
    const status = range ? 206 : 200;
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, size - 1);

    response.status(status);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', mediaContentType(mediaPath));
    response.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1));
    response.setHeader('Cache-Control', 'private, no-store');
    if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    if (headOnly || size === 0) {
      response.end();
      return;
    }

    await new Promise<void>((resolveStream, reject) => {
      const stream = createReadStream(mediaPath, { start, end });
      stream.once('error', reject);
      response.once('finish', resolveStream);
      response.once('close', () => {
        stream.destroy();
        resolveStream();
      });
      stream.pipe(response);
    });
  }

}
