import { GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { access, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStreamToken } from './cast-stream-token';
import { isPathWithin, streamTokenMatches } from './direct-stream-policy';
import { applyMediaCors } from './media-cors';
import {
  embeddedSubtitleDescriptors,
  decodeSubtitleBuffer,
  sidecarSubtitleDescriptor,
  subtitleLanguageLabel,
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
  forced: boolean;
  hearingImpaired: boolean;
  default: boolean;
  src: string | null;
  contentType: 'text/vtt' | null;
  delivery: 'webvtt' | 'burn_in';
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
      forced: track.forced,
      hearingImpaired: track.hearingImpaired,
      default: track.default,
      src: `/api/v1/playback/sessions/${sessionId}/subtitles/sidecar-${index}.vtt?token=${encodedToken}`,
      contentType: 'text/vtt',
      delivery: 'webvtt',
    }));
    if (includeEmbedded) {
      for (const track of embeddedSubtitleDescriptors(file.probe)) {
        tracks.push({
          id: `embedded-${track.streamIndex}`,
          label: track.label,
          language: track.language,
          forced: track.forced,
          hearingImpaired: track.hearingImpaired,
          default: track.default,
          src: `/api/v1/playback/sessions/${sessionId}/subtitles/embedded-${track.streamIndex}.vtt?token=${encodedToken}`,
          contentType: 'text/vtt',
          delivery: 'webvtt',
        });
      }
    }
    for (const track of imageSubtitleDescriptors(file.probe)) {
      tracks.push({
        id: `burnin-${track.streamIndex}`,
        label: `${track.label} · Burn-in`,
        language: track.language,
        forced: track.forced,
        hearingImpaired: track.hearingImpaired,
        default: track.default,
        src: null,
        contentType: null,
        delivery: 'burn_in',
      });
    }
    return tracks;
  }

  async status(sessionId: string, token: string | undefined) {
    const session = await this.validSession(sessionId, token);
    const embedded = embeddedSubtitleDescriptors(session.media.file!.probe);
    if (!embedded.length) return { state: 'ready', message: 'No embedded text subtitles require preparation' };
    const expectedTrackIds = embedded.map((track) => `embedded-${track.streamIndex}`);
    const manifest = await readSubtitleManifest(resolve(this.transcodeRoot, session.id, 'subtitle-status.json'));
    if (manifest) {
      const available = new Set(manifest.availableTrackIds);
      const unavailableTrackIds = expectedTrackIds.filter((trackId) => !available.has(trackId));
      return {
        state: 'ready',
        message: unavailableTrackIds.length
          ? 'Embedded subtitles are ready with unavailable tracks omitted'
          : 'Embedded subtitles are ready',
        unavailableTrackIds,
      };
    }
    const ready = await Promise.all(embedded.map((track) =>
      access(resolve(this.transcodeRoot, session.id, `embedded-${track.streamIndex}.vtt`))
        .then(() => true)
        .catch(() => false),
    ));
    if (ready.every(Boolean)) return { state: 'ready', message: 'Embedded subtitles are ready', unavailableTrackIds: [] };
    const job = await this.prisma.systemJob.findFirst({
      where: subtitlePreparationJobFilter(session.accountId, session.id),
      include: { attempts: { orderBy: { number: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    if (job?.status === 'failed' || job?.status === 'completed') {
      const unavailableTrackIds = expectedTrackIds.filter((_trackId, index) => !ready[index]);
      return {
        state: 'ready',
        message: job.attempts[0]?.error ?? 'Unavailable embedded subtitle tracks were omitted',
        unavailableTrackIds,
      };
    }
    if (!job) return { state: 'failed', message: 'The subtitle preparation job was not found' };
    return {
      state: job.status === 'running' ? 'running' : 'queued',
      message: job.status === 'running' ? 'FFmpeg is preparing embedded subtitles' : 'Waiting for a subtitle worker',
    };
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
      body = subtitleToWebVtt(decodeSubtitleBuffer(await readFile(track.path)), track.format);
    } else if (embeddedMatch) {
      const embeddedPath = resolve(this.transcodeRoot, session.id, asset);
      if (!isPathWithin(resolve(this.transcodeRoot, session.id), embeddedPath)) {
        throw new UnauthorizedException({ code: 'subtitle_path_invalid', message: 'Subtitle path escapes its session' });
      }
      const resolvedPath = await realpath(embeddedPath).catch(() => null);
      if (!resolvedPath || !isPathWithin(resolve(this.transcodeRoot, session.id), resolvedPath)) {
        throw new NotFoundException({ code: 'subtitle_not_ready', message: 'Embedded subtitle track is not ready' });
      }
      body = subtitleToWebVtt(decodeSubtitleBuffer(await readFile(resolvedPath)), 'vtt');
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
    const videoFilename = basename(mediaPath);
    const tracks: Array<SidecarTrack & { sortKey: string }> = [];
    await this.collectSidecars(rootPath, directory, videoFilename, false, tracks);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || !isSubtitleDirectoryName(entry.name)) continue;
      const subtitleDirectory = await realpath(resolve(directory, entry.name)).catch(() => null);
      if (!subtitleDirectory || !isPathWithin(rootPath, subtitleDirectory)) continue;
      await this.collectSidecars(rootPath, subtitleDirectory, videoFilename, true, tracks, `${entry.name}/`);
    }
    return tracks
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map(({ sortKey: _sortKey, ...track }) => track);
  }

  private async collectSidecars(
    rootPath: string,
    directory: string,
    videoFilename: string,
    allowLanguageOnly: boolean,
    tracks: Array<SidecarTrack & { sortKey: string }>,
    sortPrefix = '',
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile()) continue;
      const descriptor = sidecarSubtitleDescriptor(videoFilename, entry.name, { allowLanguageOnly });
      if (!descriptor) continue;
      const candidate = await realpath(resolve(directory, entry.name)).catch(() => null);
      if (!candidate || !isPathWithin(rootPath, candidate)) continue;
      const candidateStat = await stat(candidate).catch(() => null);
      if (!candidateStat?.isFile() || candidateStat.size > 10 * 1024 * 1024) continue;
      tracks.push({ ...descriptor, path: candidate, sortKey: `${sortPrefix}${entry.name}` });
    }
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
    const streamToken = resolveStreamToken(sessionId, token, process.env.JWT_SECRET ?? '');
    if (!streamToken || !streamTokenMatches(streamToken, session.streamTokenHash)) {
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

export function subtitlePreparationJobFilter(accountId: string, sessionId: string) {
  return {
    accountId,
    type: 'playback.transcode' as const,
    AND: [
      { payload: { path: ['sessionId'], equals: sessionId } },
      { payload: { path: ['streamMode'], equals: 'subtitle_only' } },
    ],
  };
}

type SubtitlePreparationManifest = {
  availableTrackIds: string[];
  unavailableTrackIds: string[];
};

async function readSubtitleManifest(path: string): Promise<SubtitlePreparationManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<SubtitlePreparationManifest>;
    if (!Array.isArray(parsed.availableTrackIds) || !Array.isArray(parsed.unavailableTrackIds)) return null;
    if (![...parsed.availableTrackIds, ...parsed.unavailableTrackIds].every((value) => typeof value === 'string')) return null;
    return {
      availableTrackIds: parsed.availableTrackIds,
      unavailableTrackIds: parsed.unavailableTrackIds,
    };
  } catch {
    return null;
  }
}

export function imageSubtitleDescriptors(probe: unknown) {
  const root =
    typeof probe === 'object' && probe !== null && !Array.isArray(probe)
      ? probe as Record<string, unknown>
      : {};
  const streams = Array.isArray(root.streams) ? root.streams : [];
  const codecs = new Set(['dvb_subtitle', 'dvd_subtitle', 'hdmv_pgs_subtitle', 'pgssub', 'vobsub']);
  return streams.flatMap((value) => {
    const stream =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    if (
      stream.codec_type !== 'subtitle'
      || typeof stream.codec_name !== 'string'
      || !codecs.has(stream.codec_name.toLowerCase())
      || typeof stream.index !== 'number'
    ) {
      return [];
    }
    const tags =
      typeof stream.tags === 'object' && stream.tags !== null && !Array.isArray(stream.tags)
        ? stream.tags as Record<string, unknown>
        : {};
    const alias = subtitleLanguageLabel(
      typeof tags.language === 'string'
        ? tags.language
        : typeof tags.title === 'string'
        ? tags.title
        : null,
    );
    const language = alias?.code ?? 'und';
    const title = typeof tags.title === 'string' ? tags.title : alias?.label ?? language.toUpperCase();
    const disposition =
      typeof stream.disposition === 'object'
      && stream.disposition !== null
      && !Array.isArray(stream.disposition)
        ? stream.disposition as Record<string, unknown>
        : {};
    const forced = disposition.forced === 1 || /(?:^|\W)(?:forced|tvungen)(?:$|\W)/i.test(title);
    const hearingImpaired = disposition.hearing_impaired === 1 || /(?:^|\W)(?:sdh|hi|cc|hearing impaired|hørehæmmede)(?:$|\W)/i.test(title);
    const defaultTrack = disposition.default === 1 || disposition.default === true;
    return [{
      streamIndex: Math.trunc(stream.index),
      language,
      label: `${title} (${stream.codec_name})`,
      forced,
      hearingImpaired,
      default: defaultTrack,
    }];
  });
}

function isSubtitleDirectoryName(value: string): boolean {
  return ['sub', 'subs', 'subtitle', 'subtitles', 'undertekst', 'undertekster']
    .includes(value.toLowerCase().replace(/[\s_.-]+/g, ''));
}
