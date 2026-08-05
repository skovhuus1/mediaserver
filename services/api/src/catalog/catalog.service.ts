import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  detectVideoSignalProfile,
  groupBySeriesIdentity,
  sanitizeMediaTitle,
  type AuthenticatedUser,
} from '@boltbytes/contracts';
import { Prisma } from '@prisma/client';
import { readdir, realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStorageBrowsePath } from '../setup/storage-path';
import { BrowseLibraryDirectoriesDto, CatalogQueryDto, CreateLibraryDto, CreateMediaDto, QueueMetadataDto, UpdateLibraryDto } from './catalog.dto';
import { resolveLibraryPath } from './path-policy';
import { metadataSettingsStatus, resolveMetadataSettings } from '../system/metadata-settings';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listStorageRoots(actor: AuthenticatedUser) {
    return this.prisma.storageRoot.findMany({
      where: { accountId: actor.accountId },
      select: { id: true, label: true, mountPath: true, isReadOnly: true },
      orderBy: { label: 'asc' },
    });
  }

  async browseDirectories(actor: AuthenticatedUser, dto: BrowseLibraryDirectoriesDto) {
    const root = await this.prisma.storageRoot.findFirst({
      where: { id: dto.storageRootId, accountId: actor.accountId },
    });
    if (!root) throw new NotFoundException({ code: 'storage_root_missing', message: 'Storage root does not exist in this account' });
    const requested = resolveStorageBrowsePath(root.mountPath, dto.path ?? root.mountPath);
    if (!requested) throw new BadRequestException({ code: 'path_outside_root', message: 'Directory must stay within its storage root' });
    try {
      const [rootRealPath, selectedRealPath] = await Promise.all([realpath(root.mountPath), realpath(requested)]);
      if (!resolveStorageBrowsePath(rootRealPath, selectedRealPath)) {
        throw new ForbiddenException({ code: 'path_outside_root', message: 'Resolved directory escapes its storage root' });
      }
      const relativePath = posix.relative(rootRealPath, selectedRealPath);
      const currentPath = relativePath ? posix.join(root.mountPath, relativePath) : root.mountPath;
      const entries = await readdir(selectedRealPath, { withFileTypes: true });
      return {
        currentPath,
        parentPath: currentPath === root.mountPath ? null : posix.dirname(currentPath),
        directories: entries
          .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
          .sort((left, right) => left.name.localeCompare(right.name, 'da'))
          .map((entry) => ({ name: entry.name, path: posix.join(currentPath, entry.name) })),
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new NotFoundException({ code: 'media_directory_missing', message: 'Media directory does not exist' });
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ForbiddenException({ code: 'media_directory_unreadable', message: 'Media directory cannot be read by BoltBytes' });
      }
      throw error;
    }
  }

  listLibraries(actor: AuthenticatedUser) {
    return this.prisma.library.findMany({
      where: { accountId: actor.accountId },
      include: {
        paths: true,
        storageRoot: { select: { id: true, label: true, mountPath: true, isReadOnly: true } },
        scans: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createLibrary(actor: AuthenticatedUser, dto: CreateLibraryDto) {
    const root = await this.prisma.storageRoot.findFirst({
      where: { id: dto.storageRootId, accountId: actor.accountId },
    });
    if (!root) throw new NotFoundException({ code: 'storage_root_missing', message: 'Storage root does not exist in this account' });
    const resolvedPath = resolveLibraryPath(root.mountPath, dto.path);
    if (!resolvedPath) throw new BadRequestException({ code: 'path_outside_root', message: 'Library path must stay within its storage root' });
    await this.assertReadableLibraryPath(root.mountPath, resolvedPath);
    return this.prisma.library.create({
      data: {
        accountId: actor.accountId,
        storageRootId: root.id,
        name: dto.name.trim(),
        type: dto.type,
        autoScanEnabled: dto.autoScanEnabled,
        scanIntervalMinutes: dto.scanIntervalMinutes,
        paths: { create: { path: resolvedPath, recursive: dto.recursive } },
      },
      include: { paths: true },
    });
  }

  async updateLibrary(actor: AuthenticatedUser, libraryId: string, dto: UpdateLibraryDto) {
    const library = await this.prisma.library.findFirst({
      where: { id: libraryId, accountId: actor.accountId },
      include: { paths: { orderBy: { id: 'asc' } } },
    });
    if (!library) throw new NotFoundException({ code: 'library_missing', message: 'Library does not exist in this account' });
    await this.assertLibraryIdle(libraryId);
    const root = await this.prisma.storageRoot.findFirst({
      where: { id: dto.storageRootId ?? library.storageRootId, accountId: actor.accountId },
    });
    if (!root) throw new NotFoundException({ code: 'storage_root_missing', message: 'Storage root does not exist in this account' });
    const requestedPath = dto.path ?? library.paths[0]?.path;
    if (!requestedPath) throw new BadRequestException({ code: 'library_path_missing', message: 'Library must have a media path' });
    const resolvedPath = resolveLibraryPath(root.mountPath, requestedPath);
    if (!resolvedPath) throw new BadRequestException({ code: 'path_outside_root', message: 'Library path must stay within its storage root' });
    await this.assertReadableLibraryPath(root.mountPath, resolvedPath);
    return this.prisma.$transaction(async (tx) => {
      await tx.library.update({
        where: { id: library.id },
        data: {
          storageRootId: root.id,
          name: dto.name?.trim() ?? library.name,
          type: dto.type ?? library.type,
          autoScanEnabled: dto.autoScanEnabled ?? library.autoScanEnabled,
          scanIntervalMinutes: dto.scanIntervalMinutes ?? library.scanIntervalMinutes,
        },
      });
      await tx.libraryPath.deleteMany({ where: { libraryId: library.id } });
      await tx.libraryPath.create({
        data: {
          libraryId: library.id,
          path: resolvedPath,
          recursive: dto.recursive ?? library.paths[0]?.recursive ?? true,
        },
      });
      return tx.library.findUnique({
        where: { id: library.id },
        include: {
          paths: true,
          storageRoot: { select: { id: true, label: true, mountPath: true, isReadOnly: true } },
          scans: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
    });
  }

  async deleteLibrary(actor: AuthenticatedUser, libraryId: string) {
    const library = await this.prisma.library.findFirst({
      where: { id: libraryId, accountId: actor.accountId },
      select: { id: true },
    });
    if (!library) throw new NotFoundException({ code: 'library_missing', message: 'Library does not exist in this account' });
    await this.assertLibraryIdle(library.id);
    const mediaIds = (await this.prisma.mediaItem.findMany({
      where: { libraryId: library.id, accountId: actor.accountId },
      select: { id: true },
    })).map(({ id }) => id);
    if (mediaIds.length) {
      const activePlayback = await this.prisma.playbackSession.findFirst({
        where: {
          mediaId: { in: mediaIds },
          status: { in: ['reserving', 'active', 'paused'] },
          leaseExpiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (activePlayback) {
        throw new ConflictException({
          code: 'library_playback_active',
          message: 'Library cannot be deleted while one of its media items is actively playing',
          details: { playbackSessionId: activePlayback.id },
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      if (mediaIds.length) {
        await tx.playbackSession.deleteMany({ where: { mediaId: { in: mediaIds } } });
      }
      await tx.library.delete({ where: { id: library.id } });
    });
    return { deleted: true, id: library.id };
  }

  async listMedia(actor: AuthenticatedUser) {
    const items = await this.prisma.mediaItem.findMany({
      where: { accountId: actor.accountId },
      include: {
        file: {
          select: {
            id: true,
            relativePath: true,
            sizeBytes: true,
            status: true,
            durationMs: true,
            videoCodec: true,
            audioCodec: true,
            probe: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map((item) => this.serializeMedia(item));
  }

  async listCatalog(actor: AuthenticatedUser, query: CatalogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const where = this.catalogWhere(actor, query);
    const [categories, libraries] = await this.prisma.$transaction([
      this.prisma.mediaItem.findMany({
        where: { accountId: actor.accountId, category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.library.findMany({
        where: { accountId: actor.accountId },
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const facets = {
      categories: categories.flatMap(({ category }) => category ? [category] : []),
      libraries,
    };

    if (query.type === 'series') {
      const rows = await this.prisma.mediaItem.findMany({
        where,
        select: {
          id: true,
          title: true,
          category: true,
          seriesTitle: true,
          seriesDisplayTitle: true,
          seriesOverview: true,
          seriesMetadataProviderId: true,
          posterPath: true,
          backdropPath: true,
          metadataProvider: true,
          releaseYear: true,
          updatedAt: true,
        },
      });
      const grouped = groupBySeriesIdentity(rows).map((episodes) => {
        const representative = [...episodes].sort(
          (left, right) => seriesMetadataScore(right) - seriesMetadataScore(left),
        )[0]!;
        const releaseYears = episodes.flatMap((episode) =>
          episode.releaseYear === null ? [] : [episode.releaseYear],
        );
        return {
          id: representative.id,
          title: representative.seriesDisplayTitle
            ?? sanitizeMediaTitle(representative.seriesTitle ?? representative.title),
          type: 'series',
          seriesTitle: representative.seriesTitle,
          seriesDisplayTitle: representative.seriesDisplayTitle,
          seriesMetadataProviderId: representative.seriesMetadataProviderId,
          category: episodes.find((episode) => episode.category)?.category ?? null,
          overview: episodes.find((episode) => episode.seriesOverview)?.seriesOverview ?? null,
          metadataProvider: episodes.find((episode) => episode.metadataProvider)?.metadataProvider ?? null,
          posterPath: episodes.find((episode) => episode.posterPath)?.posterPath ?? null,
          backdropPath: episodes.find((episode) => episode.backdropPath)?.backdropPath ?? null,
          releaseYear: releaseYears.length ? Math.min(...releaseYears) : null,
          episodeCount: episodes.length,
          updatedAt: new Date(Math.max(...episodes.map((episode) => episode.updatedAt.getTime()))),
        };
      });
      grouped.sort((left, right) => {
        if (query.sort === 'title') return left.title.localeCompare(right.title, 'da');
        if (query.sort === 'year') return (right.releaseYear ?? 0) - (left.releaseYear ?? 0)
          || left.title.localeCompare(right.title, 'da');
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      });
      const total = grouped.length;
      return {
        items: grouped.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        facets,
      };
    }

    const orderBy: Prisma.MediaItemOrderByWithRelationInput[] =
      query.sort === 'title'
        ? [{ title: 'asc' }]
        : query.sort === 'year'
          ? [{ releaseYear: 'desc' }, { title: 'asc' }]
          : [{ updatedAt: 'desc' }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mediaItem.findMany({
        where,
        include: {
          library: { select: { id: true, name: true, type: true } },
          file: {
            select: {
              id: true,
              relativePath: true,
              sizeBytes: true,
              status: true,
              durationMs: true,
              videoCodec: true,
              audioCodec: true,
              probe: true,
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.mediaItem.count({ where }),
    ]);
    return {
      items: items.map((item) => this.serializeMedia(item)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      facets,
    };
  }

  async getMedia(actor: AuthenticatedUser, mediaId: string) {
    const item = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      include: {
        library: { select: { id: true, name: true, type: true } },
        file: true,
      },
    });
    if (!item) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    return this.serializeMedia(item);
  }

  async getMediaDetails(actor: AuthenticatedUser, mediaId: string) {
    const seed = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      include: {
        library: { select: { id: true, name: true, type: true } },
        file: true,
      },
    });
    if (!seed) {
      throw new NotFoundException({
        code: 'media_missing',
        message: 'Media does not exist in this account',
      });
    }
    if (seed.type !== 'episode') {
      return { kind: 'movie' as const, item: this.serializeMedia(seed), seasons: [] };
    }

    const episodes = await this.prisma.mediaItem.findMany({
      where: {
        accountId: actor.accountId,
        type: 'episode',
        ...(seed.seriesMetadataProviderId
          ? { seriesMetadataProviderId: seed.seriesMetadataProviderId }
          : seed.seriesDisplayTitle
            ? { seriesDisplayTitle: { equals: seed.seriesDisplayTitle, mode: 'insensitive' } }
            : { seriesTitle: { equals: seed.seriesTitle ?? seed.title, mode: 'insensitive' } }),
      },
      include: {
        library: { select: { id: true, name: true, type: true } },
        file: true,
      },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }, { title: 'asc' }],
    });
    const representative = [...episodes].sort(
      (left, right) => seriesMetadataScore(right) - seriesMetadataScore(left),
    )[0] ?? seed;
    const serializedEpisodes = episodes.map((episode) => this.serializeMedia(episode));
    const seasonNumbers = [...new Set(episodes.map((episode) => episode.seasonNumber ?? 0))]
      .sort((left, right) => left - right);
    const releaseYears = episodes.flatMap((episode) =>
      episode.releaseYear === null ? [] : [episode.releaseYear],
    );
    return {
      kind: 'series' as const,
      item: {
        ...this.serializeMedia(representative),
        id: seed.id,
        type: 'series',
        title: representative.seriesDisplayTitle
          ?? sanitizeMediaTitle(representative.seriesTitle ?? representative.title),
        overview: representative.seriesOverview ?? representative.overview,
        releaseYear: releaseYears.length ? Math.min(...releaseYears) : null,
        episodeCount: episodes.length,
      },
      seasons: seasonNumbers.map((number) => ({
        number,
        title: number === 0 ? 'Specials' : `Sæson ${number}`,
        posterPath: episodes.find(
          (episode) => (episode.seasonNumber ?? 0) === number && episode.seasonPosterPath,
        )?.seasonPosterPath ?? null,
        episodes: serializedEpisodes.filter(
          (episode) => (episode.seasonNumber ?? 0) === number,
        ),
      })),
    };
  }

  async metadataStatus(actor: AuthenticatedUser) {
    const [latestJob, settings] = await Promise.all([
      this.prisma.systemJob.findFirst({
        where: { accountId: actor.accountId, type: 'media.metadata' },
        select: { id: true, status: true, attemptCount: true, maxAttempts: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      metadataSettingsStatus(this.prisma, actor.accountId),
    ]);
    return {
      ...settings,
      latestJob,
    };
  }

  async queueMetadata(actor: AuthenticatedUser, dto: QueueMetadataDto = { mediaType: 'all' }) {
    const settings = await resolveMetadataSettings(this.prisma, actor.accountId);
    const supportsMovies = Boolean(settings.tmdbToken);
    const supportsSeries = Boolean(settings.tvdbApiKey || settings.tmdbToken);
    const supported = dto.mediaType === 'movie'
      ? supportsMovies
      : dto.mediaType === 'series'
        ? supportsSeries
        : supportsMovies || supportsSeries;
    if (!supported) {
      throw new ConflictException({
        code: 'metadata_provider_disabled',
        message: dto.mediaType === 'movie'
          ? 'TMDB is not configured for movie metadata'
          : 'TVDB or TMDB is not configured for series metadata',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:media-metadata'),
          hashtext(CAST(${actor.accountId} AS text))
        )::text AS lock_result
      `;
      const active = await tx.systemJob.findFirst({
        where: { accountId: actor.accountId, type: 'media.metadata', status: { in: ['queued', 'running'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (active) {
        throw new ConflictException({
          code: 'metadata_job_active',
          message: 'A metadata job is already queued or running',
          details: { jobId: active.id, status: active.status },
        });
      }
      return tx.systemJob.create({
        data: {
          accountId: actor.accountId,
          type: 'media.metadata',
          status: 'queued',
          payload: { onlyMissing: false, requestedBy: actor.sub, mediaType: dto.mediaType },
          maxAttempts: 3,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async queueMediaMetadata(actor: AuthenticatedUser, mediaId: string) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, type: true },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    const settings = await resolveMetadataSettings(this.prisma, actor.accountId);
    if (!settings.tmdbToken && !settings.tvdbApiKey) {
      throw new ConflictException({ code: 'metadata_provider_disabled', message: 'TMDB or TVDB must be configured first' });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:media-metadata-item'),
          hashtext(CAST(${mediaId} AS text))
        )::text AS lock_result
      `;
      const active = await tx.systemJob.findFirst({
        where: { accountId: actor.accountId, type: 'media.metadata', status: { in: ['queued', 'running'] } },
      });
      if (active) throw new ConflictException({ code: 'metadata_job_active', message: 'A metadata job is already queued or running' });
      const job = await tx.systemJob.create({
        data: {
          accountId: actor.accountId,
          type: 'media.metadata',
          status: 'queued',
          payload: { mediaId, onlyMissing: false, force: true, requestedBy: actor.sub },
          maxAttempts: 3,
        },
      });
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId,
          action: 'media.metadata.refresh',
          outcome: 'allowed',
          code: 'media_metadata_refresh',
          details: { mediaId, jobId: job.id },
        },
      });
      return job;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async setMetadataLock(actor: AuthenticatedUser, mediaId: string, locked: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mediaItem.updateMany({
        where: { id: mediaId, accountId: actor.accountId },
        data: { metadataLocked: locked },
      });
      if (!updated.count) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId,
          action: 'media.metadata.lock',
          outcome: 'allowed',
          code: 'media_metadata_lock',
          details: { mediaId, locked },
        },
      });
      return { id: mediaId, metadataLocked: locked };
    });
  }

  listScans(actor: AuthenticatedUser, libraryId: string) {
    return this.prisma.libraryScan.findMany({
      where: { accountId: actor.accountId, libraryId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  }

  async queueScan(actor: AuthenticatedUser, libraryId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:library-scan'),
          hashtext(CAST(${libraryId} AS text))
        )::text AS lock_result
      `;
      const library = await tx.library.findFirst({ where: { id: libraryId, accountId: actor.accountId } });
      if (!library) throw new NotFoundException({ code: 'library_missing', message: 'Library does not exist in this account' });
      const active = await tx.libraryScan.findFirst({
        where: { libraryId, status: { in: ['queued', 'running'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (active) {
        throw new ConflictException({
          code: 'library_scan_active',
          message: 'A scan is already queued or running for this library',
          details: { scanId: active.id, status: active.status },
        });
      }
      const scan = await tx.libraryScan.create({
        data: { accountId: actor.accountId, libraryId, status: 'queued' },
      });
      const job = await tx.systemJob.create({
        data: {
          accountId: actor.accountId,
          type: 'library.scan',
          status: 'queued',
          payload: { libraryId, scanId: scan.id, requestedBy: actor.sub },
          maxAttempts: 3,
        },
      });
      await tx.library.update({ where: { id: library.id }, data: { lastScheduledScanAt: new Date() } });
      return tx.libraryScan.update({ where: { id: scan.id }, data: { jobId: job.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async createMedia(actor: AuthenticatedUser, dto: CreateMediaDto) {
    const library = await this.prisma.library.findFirst({ where: { id: dto.libraryId, accountId: actor.accountId } });
    if (!library) throw new NotFoundException({ code: 'library_missing', message: 'Library does not exist in this account' });
    return this.prisma.mediaItem.create({
      data: {
        accountId: actor.accountId,
        libraryId: library.id,
        title: dto.title.trim(),
        type: dto.type,
        codec: dto.codec ?? null,
        container: dto.container ?? null,
        bitrate: dto.bitrate ?? null,
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
        availabilityOverride: dto.availabilityOverride ? new Date(dto.availabilityOverride) : null,
      },
    });
  }

  private async assertLibraryIdle(libraryId: string): Promise<void> {
    const active = await this.prisma.libraryScan.findFirst({
      where: { libraryId, status: { in: ['queued', 'running'] } },
      select: { id: true, status: true },
    });
    if (active) {
      throw new ConflictException({
        code: 'library_scan_active',
        message: 'Library cannot be changed while a scan is queued or running',
        details: { scanId: active.id, status: active.status },
      });
    }
  }

  private catalogWhere(actor: AuthenticatedUser, query: CatalogQueryDto): Prisma.MediaItemWhereInput {
    const where: Prisma.MediaItemWhereInput = {
      accountId: actor.accountId,
      ...(query.libraryId ? { libraryId: query.libraryId } : {}),
      ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
      ...(query.seriesTitle ? { seriesTitle: { equals: query.seriesTitle, mode: 'insensitive' } } : {}),
      ...(query.seriesDisplayTitle ? { seriesDisplayTitle: { equals: query.seriesDisplayTitle, mode: 'insensitive' } } : {}),
      ...(query.seriesMetadataProviderId ? { seriesMetadataProviderId: query.seriesMetadataProviderId } : {}),
      ...(query.q ? {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { seriesTitle: { contains: query.q, mode: 'insensitive' } },
          { category: { contains: query.q, mode: 'insensitive' } },
        ],
      } : {}),
    };
    if (query.type === 'series') {
      where.type = 'episode';
      where.seriesTitle = query.seriesTitle
        ? { equals: query.seriesTitle, mode: 'insensitive' }
        : { not: null };
    } else if (query.type) {
      where.type = query.type;
    }
    return where;
  }

  private serializeMedia<T extends { file?: { sizeBytes: bigint; probe?: unknown } | null }>(item: T) {
    const signal = detectVideoSignalProfile(item.file?.probe);
    const file = item.file
      ? (({ probe: _probe, ...publicFile }) => ({ ...publicFile, sizeBytes: item.file!.sizeBytes.toString() }))(item.file)
      : null;
    return {
      ...item,
      hdr: signal.hdr,
      file,
    };
  }

  private async assertReadableLibraryPath(rootPath: string, libraryPath: string): Promise<void> {
    try {
      const [rootRealPath, libraryRealPath] = await Promise.all([realpath(rootPath), realpath(libraryPath)]);
      if (!resolveStorageBrowsePath(rootRealPath, libraryRealPath)) {
        throw new ForbiddenException({ code: 'path_outside_root', message: 'Resolved library path escapes its storage root' });
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new NotFoundException({ code: 'media_directory_missing', message: 'Media directory does not exist' });
      }
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ForbiddenException({ code: 'media_directory_unreadable', message: 'Media directory cannot be read by BoltBytes' });
      }
      throw error;
    }
  }
}

function seriesMetadataScore(item: {
  seriesMetadataProviderId: string | null;
  seriesDisplayTitle: string | null;
  seriesOverview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
}) {
  return Number(Boolean(item.seriesMetadataProviderId)) * 8
    + Number(Boolean(item.seriesDisplayTitle)) * 4
    + Number(Boolean(item.seriesOverview)) * 3
    + Number(Boolean(item.posterPath)) * 2
    + Number(Boolean(item.backdropPath));
}
