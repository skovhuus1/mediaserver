import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPathWithin, parseByteRange } from './direct-stream-policy';
import { OfflineDownloadProgressDto, PrepareOfflineDownloadDto } from './offline-downloads.dto';

const TOKEN_TTL_MS = 48 * 60 * 60 * 1_000;
const LICENSE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const OFFLINE_HEIGHTS = [360, 480, 720, 1080] as const;

const offlineInclude = Prisma.validator<Prisma.OfflineDownloadInclude>()({
  media: {
    include: {
      file: true,
      library: { select: { id: true, name: true, type: true } },
    },
  },
});

type OfflineWithMedia = Prisma.OfflineDownloadGetPayload<{ include: typeof offlineInclude }>;

@Injectable()
export class OfflineDownloadsService {
  private readonly transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(actor: AuthenticatedUser) {
    const { profileId, deviceId } = this.context(actor);
    const rows = await this.prisma.offlineDownload.findMany({
      where: { accountId: actor.accountId, profileId, deviceId },
      include: offlineInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.response(row));
  }

  async status(actor: AuthenticatedUser, id: string) {
    return this.response(await this.owned(actor, id));
  }

  async prepare(actor: AuthenticatedUser, dto: PrepareOfflineDownloadDto) {
    const { profileId, deviceId } = this.context(actor);
    const entitlement = await this.entitlements.evaluate(actor, {
      profileId,
      mediaId: dto.mediaId,
      action: 'offline_download',
      device: { deviceId, supportedCodecs: ['h264', 'aac'] },
    });
    if (!entitlement.allowed) {
      throw new ForbiddenException({
        code: entitlement.code,
        message: entitlement.reasons[0] ?? 'Offline download is not allowed',
      });
    }
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: dto.mediaId, accountId: actor.accountId },
      include: { file: true },
    });
    if (!media?.file || media.file.status !== 'ready') {
      throw new NotFoundException({
        code: 'offline_media_unavailable',
        message: 'The media item has no readable scanned file',
      });
    }
    const qualityHeight = this.qualityHeight(
      dto.qualityHeight,
      entitlement.effective.maxVideoResolution,
      media.height,
    );
    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
    const licenseExpiresAt = new Date(now.getTime() + LICENSE_TTL_MS);
    const generation = randomUUID();

    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.offlineDownload.findUnique({
        where: { profileId_deviceId_mediaId: { profileId, deviceId, mediaId: dto.mediaId } },
        include: offlineInclude,
      });
      const reusable = existing
        && existing.qualityHeight === qualityHeight
        && ['queued', 'preparing', 'ready', 'downloaded'].includes(existing.status);
      if (reusable) {
        return tx.offlineDownload.update({
          where: { id: existing.id },
          data: {
            downloadTokenHash: hashToken(rawToken),
            downloadTokenExpiresAt: tokenExpiresAt,
            licenseExpiresAt,
            error: null,
          },
          include: offlineInclude,
        });
      }
      if (existing?.jobId) {
        await tx.systemJob.updateMany({
          where: { id: existing.jobId, status: 'queued' },
          data: { status: 'failed' },
        });
      }
      let download = await tx.offlineDownload.upsert({
        where: { profileId_deviceId_mediaId: { profileId, deviceId, mediaId: dto.mediaId } },
        create: {
          accountId: actor.accountId,
          profileId,
          deviceId,
          mediaId: dto.mediaId,
          qualityHeight,
          status: 'queued',
          generation,
          downloadTokenHash: hashToken(rawToken),
          downloadTokenExpiresAt: tokenExpiresAt,
          licenseExpiresAt,
        },
        update: {
          qualityHeight,
          status: 'queued',
          progress: 0,
          generation,
          outputPath: null,
          sizeBytes: null,
          downloadTokenHash: hashToken(rawToken),
          downloadTokenExpiresAt: tokenExpiresAt,
          licenseExpiresAt,
          error: null,
          readyAt: null,
          downloadedAt: null,
        },
        include: offlineInclude,
      });
      const job = await tx.systemJob.create({
        data: {
          accountId: actor.accountId,
          type: 'offline.prepare',
          status: 'queued',
          payload: { downloadId: download.id, generation },
          maxAttempts: 3,
        },
      });
      download = await tx.offlineDownload.update({
        where: { id: download.id },
        data: { jobId: job.id },
        include: offlineInclude,
      });
      return download;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.response(row, rawToken);
  }

  async renew(actor: AuthenticatedUser, id: string) {
    const row = await this.owned(actor, id);
    const entitlement = await this.entitlements.evaluate(actor, {
      profileId: row.profileId,
      mediaId: row.mediaId,
      action: 'offline_download',
      device: { deviceId: row.deviceId, supportedCodecs: ['h264', 'aac'] },
    });
    if (!entitlement.allowed) {
      throw new ForbiddenException({
        code: entitlement.code,
        message: entitlement.reasons[0] ?? 'Offline license could not be renewed',
      });
    }
    const rawToken = randomBytes(32).toString('base64url');
    const updated = await this.prisma.offlineDownload.update({
      where: { id: row.id },
      data: {
        downloadTokenHash: hashToken(rawToken),
        downloadTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        licenseExpiresAt: new Date(Date.now() + LICENSE_TTL_MS),
      },
      include: offlineInclude,
    });
    return this.response(updated, rawToken);
  }

  async complete(actor: AuthenticatedUser, id: string) {
    const row = await this.owned(actor, id);
    if (!['ready', 'downloaded'].includes(row.status)) {
      throw new BadRequestException({
        code: 'offline_download_not_ready',
        message: 'The prepared file is not ready to mark downloaded',
      });
    }
    const updated = await this.prisma.offlineDownload.update({
      where: { id: row.id },
      data: { status: 'downloaded', progress: 100, downloadedAt: new Date() },
      include: offlineInclude,
    });
    return this.response(updated);
  }

  async progress(actor: AuthenticatedUser, id: string, dto: OfflineDownloadProgressDto) {
    const row = await this.owned(actor, id);
    const durationMs = row.media.file?.durationMs ?? 0;
    const positionMs = durationMs > 0 ? Math.min(dto.positionMs, durationMs) : dto.positionMs;
    const completed = dto.completed === true || (durationMs > 0 && positionMs / durationMs >= 0.9);
    await this.prisma.playbackHistory.upsert({
      where: { profileId_mediaId: { profileId: row.profileId, mediaId: row.mediaId } },
      create: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: row.profileId,
        mediaId: row.mediaId,
        positionMs: completed ? durationMs : positionMs,
        completed,
      },
      update: { positionMs: completed ? durationMs : positionMs, completed },
    });
    return { mediaId: row.mediaId, positionMs, completed };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const row = await this.owned(actor, id);
    await this.prisma.$transaction(async (tx) => {
      if (row.jobId) {
        await tx.systemJob.updateMany({
          where: { id: row.jobId, status: 'queued' },
          data: { status: 'failed' },
        });
      }
      await tx.offlineDownload.delete({ where: { id: row.id } });
    });
    const directory = resolve(this.transcodeRoot, 'offline', row.id);
    if (isPathWithin(this.transcodeRoot, directory)) {
      await rm(directory, { recursive: true, force: true });
    }
    return { id, deleted: true };
  }

  async send(
    id: string,
    token: string | undefined,
    rangeHeader: string | undefined,
    response: Response,
    headOnly: boolean,
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException({ code: 'offline_token_required', message: 'Download token is required' });
    }
    const row = await this.prisma.offlineDownload.findUnique({
      where: { id },
      include: offlineInclude,
    });
    if (!row) throw new NotFoundException({ code: 'offline_download_missing', message: 'Download was not found' });
    if (!tokenMatches(token, row.downloadTokenHash)) {
      throw new UnauthorizedException({ code: 'offline_token_invalid', message: 'Download token is invalid' });
    }
    if (row.downloadTokenExpiresAt <= new Date()) {
      throw new GoneException({ code: 'offline_token_expired', message: 'Download token has expired' });
    }
    if (row.licenseExpiresAt <= new Date()) {
      throw new GoneException({ code: 'offline_license_expired', message: 'Offline license has expired' });
    }
    if (!['ready', 'downloaded'].includes(row.status) || !row.outputPath) {
      throw new HttpException({ code: 'offline_download_not_ready', message: 'Prepared file is not ready' }, 409);
    }
    const candidate = resolve(this.transcodeRoot, ...row.outputPath.split('/'));
    if (!isPathWithin(this.transcodeRoot, candidate)) {
      throw new UnauthorizedException({ code: 'offline_path_invalid', message: 'Download path is invalid' });
    }
    const mediaPath = await realpath(candidate).catch(() => null);
    if (!mediaPath || !isPathWithin(this.transcodeRoot, mediaPath)) {
      throw new NotFoundException({ code: 'offline_file_missing', message: 'Prepared file is missing' });
    }
    const fileStat = await stat(mediaPath);
    if (!fileStat.isFile()) throw new NotFoundException({ code: 'offline_file_missing', message: 'Prepared file is missing' });
    let range;
    try {
      range = parseByteRange(rangeHeader, fileStat.size);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      response.setHeader('Content-Range', `bytes */${fileStat.size}`);
      throw new HttpException({ code: 'invalid_byte_range', message: error.message }, 416);
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, fileStat.size - 1);
    response.status(range ? 206 : 200);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', 'video/mp4');
    response.setHeader('Content-Length', String(fileStat.size === 0 ? 0 : end - start + 1));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(this.filename(row))}`);
    if (range) response.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
    if (headOnly || fileStat.size === 0) {
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

  private async owned(actor: AuthenticatedUser, id: string): Promise<OfflineWithMedia> {
    const { profileId, deviceId } = this.context(actor);
    const row = await this.prisma.offlineDownload.findFirst({
      where: { id, accountId: actor.accountId, profileId, deviceId },
      include: offlineInclude,
    });
    if (!row) throw new NotFoundException({ code: 'offline_download_missing', message: 'Download was not found' });
    return row;
  }

  private context(actor: AuthenticatedUser) {
    if (!actor.profileId || !actor.deviceId) {
      throw new BadRequestException({
        code: 'offline_context_required',
        message: 'An active profile and registered device are required',
      });
    }
    return { profileId: actor.profileId, deviceId: actor.deviceId };
  }

  private qualityHeight(requested: number, planMaximum: number, sourceHeight: number | null) {
    const maximum = Math.min(requested, planMaximum, sourceHeight ?? requested);
    const selected = [...OFFLINE_HEIGHTS].reverse().find((height) => height <= maximum);
    if (!selected) {
      throw new ForbiddenException({
        code: 'offline_resolution_not_allowed',
        message: 'The active plan does not allow an offline resolution supported by this client',
      });
    }
    return selected;
  }

  private response(row: OfflineWithMedia, token?: string) {
    return {
      id: row.id,
      mediaId: row.mediaId,
      profileId: row.profileId,
      deviceId: row.deviceId,
      status: row.status,
      progress: row.progress,
      qualityHeight: row.qualityHeight,
      sizeBytes: row.sizeBytes?.toString() ?? null,
      licenseExpiresAt: row.licenseExpiresAt.toISOString(),
      downloadTokenExpiresAt: row.downloadTokenExpiresAt.toISOString(),
      downloadUrl: token
        ? `/api/v1/offline-downloads/${row.id}/file?token=${encodeURIComponent(token)}`
        : null,
      error: row.error,
      media: {
        id: row.media.id,
        title: row.media.title,
        type: row.media.type,
        seriesTitle: row.media.seriesDisplayTitle ?? row.media.seriesTitle,
        seasonNumber: row.media.seasonNumber,
        episodeNumber: row.media.episodeNumber,
        posterPath: row.media.posterPath,
        durationMs: row.media.file?.durationMs ?? null,
      },
      createdAt: row.createdAt.toISOString(),
      readyAt: row.readyAt?.toISOString() ?? null,
      downloadedAt: row.downloadedAt?.toISOString() ?? null,
    };
  }

  private filename(row: OfflineWithMedia) {
    const title = row.media.title.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().slice(0, 120) || 'boltbytes-media';
    return `${title}-${row.qualityHeight}p.mp4`;
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, expected: string) {
  const supplied = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}
