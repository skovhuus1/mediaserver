import { GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { isPathWithin, streamTokenMatches } from './direct-stream-policy';
import { applyMediaCors } from './media-cors';
import {
  embeddedSubtitleDescriptors,
  sidecarSubtitleDescriptor,
  subtitleToWebVtt,
  type SubtitleDescriptor,
} from './subtitle-stream-policy';

type PlaybackFile = {
  relativePath: string;
  probe: unknown;
  storageRoot: { mountPath: string };
};

export type PlaybackSubtitleTrack = {
  id: string;
  label: string;
  language: string;
  src: string;
  contentType: 'text/vtt';
};

type SidecarTrack = SubtitleDescriptor & { path: string };

@Injectable()
export class SubtitleStreamService {
  private readonly transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');

  constructor(private readonly prisma: PrismaService) {}

  async listForPlayback(
    sessionId: string,
    token: string,
    file: PlaybackFile,
    includeEmbedded: boolean,
  ): Promise<PlaybackSubtitleTrack[]> {
    const encodedToken = encodeURIComponent(token);
    const sidecars = await this.discoverSidecars(file).catch(() => []);
    const tracks: PlaybackSubtitleTrack[] = sidecars.map((track, index) => ({
      id: `sidecar-${index}`,
      label: track.label,
      language: track.language,
      src: `/api/v1/playback/sessions/${sessionId}/subtitles/sidecar-${index}.vtt?token=${encodedToken}`,
      contentType: 'text/vtt',
    }));
    if (includeEmbedded) {
      for (const track of embeddedSubtitleDescriptors(file.probe)) {
        tracks.push({
          id: `embedded-${track.streamIndex}`,
          label: track.label,
          language: track.language,
          src: `/api/v1/playback/sessions/${sessionId}/subtitles/embedded-${track.streamIndex}.vtt?token=${encodedToken}`,
          contentType: 'text/vtt',
        });
      }
    }
    return tracks;
  }

  async send(
    sessionId: string,
    asset: string,
    token: string | undefined,
    origin: string | undefined,
    response: Response,
  ): Promise<void> {
    applyMediaCors(response, origin);
    const session = await this.validSession(sessionId, token);
    let body: string;
    const sidecarMatch = /^sidecar-(\d+)\.vtt$/.exec(asset);
    const embeddedMatch = /^embedded-(\d+)\.vtt$/.exec(asset);
    if (sidecarMatch) {
      const tracks = await this.discoverSidecars(session.media.file!);
      const track = tracks[Number.parseInt(sidecarMatch[1]!, 10)];
      if (!track) throw new NotFoundException({ code: 'subtitle_missing', message: 'Subtitle track was not found' });
      const fileStat = await stat(track.path);
      if (!fileStat.isFile() || fileStat.size > 10 * 1024 * 1024) {
        throw new NotFoundException({ code: 'subtitle_invalid', message: 'Subtitle track is not a supported text file' });
      }
      body = subtitleToWebVtt(await readFile(track.path, 'utf8'), track.format);
    } else if (embeddedMatch && session.method === 'transcode') {
      const embeddedPath = resolve(this.transcodeRoot, session.id, asset);
      if (!isPathWithin(resolve(this.transcodeRoot, session.id), embeddedPath)) {
        throw new UnauthorizedException({ code: 'subtitle_path_invalid', message: 'Subtitle path escapes its session' });
      }
      const resolvedPath = await realpath(embeddedPath).catch(() => null);
      if (!resolvedPath || !isPathWithin(resolve(this.transcodeRoot, session.id), resolvedPath)) {
        throw new NotFoundException({ code: 'subtitle_not_ready', message: 'Embedded subtitle track is not ready' });
      }
      body = subtitleToWebVtt(await readFile(resolvedPath, 'utf8'), 'vtt');
    } else {
      throw new NotFoundException({ code: 'subtitle_missing', message: 'Subtitle track was not found' });
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.send(body);
  }

  private async discoverSidecars(file: PlaybackFile): Promise<SidecarTrack[]> {
    const rootPath = await realpath(file.storageRoot.mountPath);
    const mediaPath = await realpath(resolve(rootPath, ...file.relativePath.split('/')));
    if (!isPathWithin(rootPath, mediaPath)) {
      throw new UnauthorizedException({ code: 'media_path_invalid', message: 'Resolved media path escapes its storage root' });
    }
    const directory = dirname(mediaPath);
    const entries = await readdir(directory, { withFileTypes: true });
    const tracks: SidecarTrack[] = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile()) continue;
      const descriptor = sidecarSubtitleDescriptor(basename(mediaPath), entry.name);
      if (!descriptor) continue;
      const candidate = await realpath(resolve(directory, entry.name));
      if (!isPathWithin(rootPath, candidate)) continue;
      tracks.push({ ...descriptor, path: candidate });
    }
    return tracks;
  }

  private async validSession(sessionId: string, token: string | undefined) {
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
    if (!session.media.file || session.media.file.status !== 'ready') {
      throw new NotFoundException({ code: 'media_file_unavailable', message: 'Scanned media file is unavailable' });
    }
    return session;
  }
}
