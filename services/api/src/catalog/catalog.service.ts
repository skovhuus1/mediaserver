import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  detectVideoSignalProfile,
  groupBySeriesIdentity,
  sanitizeMediaTitle,
  selectSeriesContinuation,
  type AuthenticatedUser,
} from '@boltbytes/contracts';
import { Prisma } from '@prisma/client';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { posix, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { resolveStorageBrowsePath } from '../setup/storage-path';
import { ApplyMetadataMatchDto, BrowseLibraryDirectoriesDto, CatalogQueryDto, CreateLibraryDto, CreateMediaDto, QueueMetadataDto, QueuePlaybackAssetsBatchDto, UpdateLibraryDto, UpdateTimelineMarkersDto } from './catalog.dto';
import { resolveLibraryPath } from './path-policy';
import { metadataSettingsStatus, resolveMetadataSettings } from '../system/metadata-settings';
import { listTvdbEpisodeOrders, resolveTvdbEpisodeOrder, searchMetadataProviders, validateMetadataSelection } from './metadata-provider';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

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
    const seriesCacheKey = query.type === 'series'
      ? `catalog:series:${actor.accountId}:${JSON.stringify(query)}`
      : null;
    if (seriesCacheKey && this.redis) {
      const cached = await this.redis.get(seriesCacheKey).catch(() => null);
      if (cached) return JSON.parse(cached);
    }
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
      const aggregates = await this.prisma.mediaItem.groupBy({
        by: [
          'seriesMetadataProviderId',
          'seriesDisplayTitle',
          'seriesTitle',
          'seriesOverview',
          'posterPath',
          'backdropPath',
          'metadataProvider',
          'category',
        ],
        where,
        _count: { _all: true },
        _min: {
          id: true,
          title: true,
          releaseYear: true,
        },
        _max: {
          updatedAt: true,
        },
      });
      const rows = aggregates.flatMap((row) => row._min.id && row._min.title ? [{
        id: row._min.id,
        title: row._min.title,
        category: row.category,
        seriesTitle: row.seriesTitle,
        seriesDisplayTitle: row.seriesDisplayTitle,
        seriesOverview: row.seriesOverview,
        seriesMetadataProviderId: row.seriesMetadataProviderId,
        posterPath: row.posterPath,
        backdropPath: row.backdropPath,
        metadataProvider: row.metadataProvider,
        releaseYear: row._min.releaseYear,
        updatedAt: row._max.updatedAt ?? new Date(0),
        episodeCount: row._count._all,
      }] : []);
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
          episodeCount: episodes.reduce((total, episode) => total + episode.episodeCount, 0),
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
      const result = {
        items: grouped.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        facets,
      };
      if (seriesCacheKey && this.redis) {
        await this.redis.setEx(seriesCacheKey, 60, JSON.stringify(result)).catch(() => undefined);
      }
      return result;
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

  async getMediaDetails(actor: AuthenticatedUser, mediaId: string, requestedSeason?: number) {
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

    const seriesWhere: Prisma.MediaItemWhereInput = {
      accountId: actor.accountId,
      type: 'episode',
      file: { is: { status: 'ready' } },
      ...(seed.seriesMetadataProviderId
        ? { seriesMetadataProviderId: seed.seriesMetadataProviderId }
        : seed.seriesDisplayTitle
          ? { seriesDisplayTitle: { equals: seed.seriesDisplayTitle, mode: 'insensitive' } }
          : { seriesTitle: { equals: seed.seriesTitle ?? seed.title, mode: 'insensitive' } }),
    };
    const episodeHeaders = await this.prisma.mediaItem.findMany({
      where: seriesWhere,
      select: {
        id: true,
        title: true,
        seasonNumber: true,
        episodeNumber: true,
        seasonPosterPath: true,
        releaseYear: true,
      },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
    });
    const history = actor.profileId ? await this.prisma.playbackHistory.findMany({
      where: {
        accountId: actor.accountId,
        profileId: actor.profileId,
        mediaId: { in: episodeHeaders.map((episode) => episode.id) },
      },
      select: { mediaId: true, positionMs: true, completed: true, updatedAt: true },
    }) : [];
    const progressByMedia = new Map(history.map((entry) => [entry.mediaId, entry]));
    const continuation = selectSeriesContinuation(episodeHeaders.map((episode) => {
      const progress = progressByMedia.get(episode.id);
      return {
        id: episode.id,
        title: episode.title,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        progress: progress ? { ...progress, durationMs: 0 } : null,
      };
    }));
    const seasonNumbers = [...new Set(episodeHeaders.map((episode) => episode.seasonNumber ?? 0))]
      .sort((left, right) => left - right);
    const selectedSeason = requestedSeason !== undefined && seasonNumbers.includes(requestedSeason)
      ? requestedSeason
      : continuation?.seasonNumber ?? seasonNumbers[0] ?? 0;
    const episodes = await this.prisma.mediaItem.findMany({
      where: { ...seriesWhere, seasonNumber: selectedSeason },
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
            width: true,
            height: true,
            bitrate: true,
            container: true,
          },
        },
      },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }, { title: 'asc' }],
    });
    const serializedEpisodes = episodes.map((episode) => {
      const progress = progressByMedia.get(episode.id);
      const durationMs = episode.file?.durationMs ?? 0;
      return {
        ...this.serializeMedia({
          ...episode,
          file: episode.file ? { ...episode.file, probe: null } : null,
        }),
        progress: progress ? {
          positionMs: progress.positionMs,
          durationMs,
          completed: progress.completed,
          percent: durationMs ? Math.min(100, Math.round(progress.positionMs / durationMs * 100)) : 0,
          updatedAt: progress.updatedAt,
        } : null,
      };
    });
    const releaseYears = episodeHeaders.flatMap((episode) =>
      episode.releaseYear === null ? [] : [episode.releaseYear],
    );
    return {
      kind: 'series' as const,
      selectedSeason,
      continuation,
      item: {
        ...this.serializeMedia(seed),
        id: seed.id,
        type: 'series',
        title: seed.seriesDisplayTitle
          ?? sanitizeMediaTitle(seed.seriesTitle ?? seed.title),
        overview: seed.seriesOverview ?? seed.overview,
        releaseYear: releaseYears.length ? Math.min(...releaseYears) : null,
        episodeCount: episodeHeaders.length,
      },
      seasons: seasonNumbers.map((number) => ({
        number,
        title: number === 0 ? 'Specials' : `Sæson ${number}`,
        posterPath: episodeHeaders.find(
          (episode) => (episode.seasonNumber ?? 0) === number && episode.seasonPosterPath,
        )?.seasonPosterPath ?? null,
        episodeCount: episodeHeaders.filter((episode) => (episode.seasonNumber ?? 0) === number).length,
        completedCount: episodeHeaders.filter((episode) =>
          (episode.seasonNumber ?? 0) === number && progressByMedia.get(episode.id)?.completed,
        ).length,
        inProgressCount: episodeHeaders.filter((episode) => {
          const progress = progressByMedia.get(episode.id);
          return (episode.seasonNumber ?? 0) === number
            && Boolean(progress && !progress.completed && progress.positionMs > 0);
        }).length,
        episodes: number === selectedSeason ? serializedEpisodes : [],
      })),
    };
  }

  async getPlaybackAssets(actor: AuthenticatedUser, mediaId: string) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, file: { select: { status: true, modifiedAt: true, durationMs: true } } },
    });
    if (!media || !media.file || media.file.status !== 'ready') {
      throw new NotFoundException({ code: 'media_file_missing', message: 'Media has no readable scanned file' });
    }
    let asset = await this.prisma.mediaPlaybackAsset.findUnique({ where: { mediaId } });
    const stale = Boolean(asset?.sourceModifiedAt && asset.sourceModifiedAt < media.file.modifiedAt);
    const retryableFailure = asset?.status === 'failed' && Date.now() - asset.updatedAt.getTime() > 60 * 60_000;
    if (!asset || stale || retryableFailure) {
      asset = (await this.queuePlaybackAssetsInternal(actor.accountId, mediaId, media.file.modifiedAt, stale)).asset;
    }
    const markers = await this.prisma.mediaTimelineMarker.findMany({
      where: { accountId: actor.accountId, mediaId },
      orderBy: { startMs: 'asc' },
    });
    const manifest = asset?.manifest && typeof asset.manifest === 'object' && !Array.isArray(asset.manifest)
      ? asset.manifest as Prisma.JsonObject
      : null;
    const cues = Array.isArray(manifest?.cues) ? manifest.cues : [];
    return {
      status: asset?.status ?? 'queued',
      error: asset?.error ?? null,
      generatedAt: asset?.generatedAt ?? null,
      markers: markers.map((marker) => ({
        id: marker.id,
        kind: marker.kind,
        startMs: marker.startMs,
        endMs: marker.endMs,
        source: marker.source,
        confidence: marker.confidence,
      })),
      trickplay: asset?.status === 'ready' ? {
        intervalSeconds: asset.intervalSeconds,
        tileWidth: asset.tileWidth,
        tileHeight: asset.tileHeight,
        columns: asset.columns,
        rows: asset.rows,
        frameCount: asset.frameCount,
        sheetCount: asset.sheetCount,
        durationMs: asset.durationMs,
        cues,
      } : null,
    };
  }

  async queuePlaybackAssets(actor: AuthenticatedUser, mediaId: string, force = false) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, file: { select: { status: true, modifiedAt: true } } },
    });
    if (!media || !media.file || media.file.status !== 'ready') {
      throw new NotFoundException({ code: 'media_file_missing', message: 'Media has no readable scanned file' });
    }
    await this.queuePlaybackAssetsInternal(actor.accountId, mediaId, media.file.modifiedAt, force);
    return this.getPlaybackAssets(actor, mediaId);
  }

  async queuePlaybackAssetsBatch(actor: AuthenticatedUser, dto: QueuePlaybackAssetsBatchDto) {
    const items = await this.prisma.mediaItem.findMany({
      where: { accountId: actor.accountId, type: { in: dto.mediaType === 'movie' ? ['movie'] : dto.mediaType === 'series' ? ['episode'] : ['movie', 'episode'] }, file: { is: { status: 'ready' } } },
      select: { id: true, file: { select: { modifiedAt: true } }, playbackAsset: { select: { status: true, sourceModifiedAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5_000,
    });
    let queued = 0;
    let skipped = 0;
    for (const item of items) {
      if (!item.file) continue;
      const fresh = item.playbackAsset?.status === 'ready' && Boolean(item.playbackAsset.sourceModifiedAt && item.playbackAsset.sourceModifiedAt >= item.file.modifiedAt);
      if (dto.mode === 'missing' && fresh) { skipped += 1; continue; }
      const result = await this.queuePlaybackAssetsInternal(actor.accountId, item.id, item.file.modifiedAt, dto.mode === 'all');
      if (result.queued) queued += 1; else skipped += 1;
    }
    await this.prisma.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: actor.profileId, action: 'media.playback_assets.batch', outcome: 'allowed', code: 'playback_assets_batch_queued', details: { mode: dto.mode, mediaType: dto.mediaType, inspected: items.length, queued, skipped } } });
    return { inspected: items.length, queued, skipped, limited: items.length === 5_000 };
  }

  async updateTimelineMarkers(actor: AuthenticatedUser, mediaId: string, dto: UpdateTimelineMarkersDto) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, file: { select: { durationMs: true } } },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    const changes = [['intro', dto.intro], ['credits', dto.credits]] as const;
    for (const [kind, range] of changes) {
      if (range === undefined || range === null) continue;
      if (range.endMs <= range.startMs) {
        throw new BadRequestException({ code: 'invalid_timeline_marker', message: `${kind} must end after it starts` });
      }
      if (media.file?.durationMs && range.endMs > media.file.durationMs + 1_000) {
        throw new BadRequestException({ code: 'invalid_timeline_marker', message: `${kind} exceeds the media duration` });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [kind, range] of changes) {
        if (range === undefined) continue;
        await tx.mediaTimelineMarker.deleteMany({ where: { accountId: actor.accountId, mediaId, kind } });
        if (range) {
          await tx.mediaTimelineMarker.create({
            data: {
              accountId: actor.accountId,
              mediaId,
              kind,
              startMs: range.startMs,
              endMs: range.endMs,
              source: 'manual',
              confidence: 1,
            },
          });
        }
      }
    });
    return this.getPlaybackAssets(actor, mediaId);
  }

  async readTrickplaySheet(actor: AuthenticatedUser, mediaId: string, sheet: number) {
    const asset = await this.prisma.mediaPlaybackAsset.findFirst({
      where: { accountId: actor.accountId, mediaId, status: 'ready' },
    });
    if (!asset?.spriteDirectory || !Number.isInteger(sheet) || sheet < 0 || sheet >= asset.sheetCount) {
      throw new NotFoundException({ code: 'trickplay_sheet_missing', message: 'Trickplay sheet does not exist' });
    }
    const root = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
    const directory = resolve(root, asset.spriteDirectory);
    if (directory !== root && !directory.startsWith(`${root}${sep}`)) {
      throw new ForbiddenException({ code: 'trickplay_path_invalid', message: 'Trickplay path escapes its storage root' });
    }
    const filePath = resolve(directory, `sprite-${String(sheet + 1).padStart(3, '0')}.jpg`);
    if (!filePath.startsWith(`${directory}${sep}`)) {
      throw new ForbiddenException({ code: 'trickplay_path_invalid', message: 'Trickplay file path is invalid' });
    }
    try {
      return await readFile(filePath);
    } catch {
      throw new NotFoundException({ code: 'trickplay_sheet_missing', message: 'Trickplay sheet is not available' });
    }
  }

  private queuePlaybackAssetsInternal(accountId: string, mediaId: string, modifiedAt: Date, force: boolean) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:playback-assets'),
          hashtext(CAST(${mediaId} AS text))
        )::text AS lock_result
      `;
      const current = await tx.mediaPlaybackAsset.findUnique({ where: { mediaId } });
      const active = await tx.systemJob.findFirst({
        where: {
          accountId,
          type: 'media.playback-assets',
          status: { in: ['queued', 'running'] },
          payload: { path: ['mediaId'], equals: mediaId },
        },
      });
      const currentIsFresh = current?.status === 'ready'
        && Boolean(current.sourceModifiedAt && current.sourceModifiedAt >= modifiedAt);
      if ((!force && currentIsFresh) || active) return {
        asset: current ?? await tx.mediaPlaybackAsset.create({ data: { accountId, mediaId, status: 'queued', sourceModifiedAt: modifiedAt } }),
        queued: false,
      };
      const asset = await tx.mediaPlaybackAsset.upsert({
        where: { mediaId },
        create: { accountId, mediaId, status: 'queued', sourceModifiedAt: modifiedAt },
        update: { status: 'queued', error: null, sourceModifiedAt: modifiedAt },
      });
      await tx.systemJob.create({
        data: {
          accountId,
          type: 'media.playback-assets',
          status: 'queued',
          payload: { mediaId, force },
          maxAttempts: 3,
        },
      });
      return { asset, queued: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
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

  async searchMetadataMatches(actor: AuthenticatedUser, mediaId: string, query: string) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, type: true, libraryId: true, seriesTitle: true },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    const kind = media.type === 'movie' ? 'movie' as const : 'series' as const;
    const settings = await resolveMetadataSettings(this.prisma, actor.accountId);
    const localKey = kind === 'movie'
      ? media.id
      : media.seriesTitle?.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const binding = localKey
      ? await this.prisma.metadataBinding.findUnique({
          where: {
            accountId_libraryId_mediaType_localKey: {
              accountId: actor.accountId,
              libraryId: media.libraryId,
              mediaType: kind,
              localKey,
            },
          },
          select: { provider: true, providerId: true, episodeOrder: true },
        })
      : null;
    return {
      mediaId,
      kind,
      currentBinding: binding,
      candidates: await searchMetadataProviders(settings, kind, query),
    };
  }

  async listMetadataEpisodeOrders(actor: AuthenticatedUser, mediaId: string, providerId: string) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, type: true },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    if (media.type === 'movie') {
      throw new BadRequestException({ code: 'metadata_episode_order_not_supported', message: 'Episodeorden kan kun vælges for serier.' });
    }
    const settings = await resolveMetadataSettings(this.prisma, actor.accountId);
    return {
      mediaId,
      providerId,
      orders: await listTvdbEpisodeOrders(settings, providerId),
    };
  }

  async applyMetadataMatch(actor: AuthenticatedUser, mediaId: string, dto: ApplyMetadataMatchDto) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, type: true, libraryId: true, seriesTitle: true, title: true },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    const kind = media.type === 'movie' ? 'movie' as const : 'series' as const;
    if (kind === 'series' && !media.seriesTitle?.trim()) {
      throw new ConflictException({ code: 'series_identity_missing', message: 'Serien mangler en stabil lokal serieidentitet og skal scannes igen.' });
    }
    const settings = await resolveMetadataSettings(this.prisma, actor.accountId);
    const selected = await validateMetadataSelection(settings, kind, dto.provider, dto.providerId);
    const requestedEpisodeOrder = dto.episodeOrder ?? 'default';
    const episodeOrder = selected.provider === 'tvdb'
      ? resolveTvdbEpisodeOrder(selected.episodeOrders, requestedEpisodeOrder)
      : 'default';
    if (selected.provider !== 'tvdb' && requestedEpisodeOrder !== 'default') {
      throw new BadRequestException({
        code: 'metadata_episode_order_not_supported',
        message: 'En alternativ episodeorden kræver et TVDB-seriematch.',
      });
    }
    const localKey = kind === 'movie'
      ? media.id
      : media.seriesTitle!.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const itemScope: Prisma.MediaItemWhereInput = kind === 'movie'
      ? { id: media.id, accountId: actor.accountId }
      : {
          accountId: actor.accountId,
          libraryId: media.libraryId,
          type: 'episode',
          seriesTitle: { equals: media.seriesTitle!, mode: 'insensitive' },
        };

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:manual-metadata-match'),
          hashtext(CAST(${actor.accountId} AS text))
        )::text AS lock_result
      `;
      const active = await tx.systemJob.findFirst({
        where: { accountId: actor.accountId, type: 'media.metadata', status: { in: ['queued', 'running'] } },
      });
      if (active) {
        throw new ConflictException({ code: 'metadata_job_active', message: 'Vent til den aktive metadataopdatering er afsluttet.' });
      }
      const binding = await tx.metadataBinding.upsert({
        where: {
          accountId_libraryId_mediaType_localKey: {
            accountId: actor.accountId,
            libraryId: media.libraryId,
            mediaType: kind,
            localKey,
          },
        },
        create: {
          accountId: actor.accountId,
          libraryId: media.libraryId,
          mediaType: kind,
          localKey,
          provider: selected.provider,
          providerId: selected.providerId,
          providerTitle: selected.title,
          episodeOrder,
          locked: dto.locked,
          matchedBy: actor.sub,
        },
        update: {
          provider: selected.provider,
          providerId: selected.providerId,
          providerTitle: selected.title,
          episodeOrder,
          locked: dto.locked,
          matchedBy: actor.sub,
        },
      });
      const affected = await tx.mediaItem.updateMany({ where: itemScope, data: { metadataLocked: dto.locked } });
      const job = await tx.systemJob.create({
        data: {
          accountId: actor.accountId,
          type: 'media.metadata',
          status: 'queued',
          payload: {
            ...(kind === 'movie' ? { mediaId: media.id } : { libraryId: media.libraryId, seriesTitle: media.seriesTitle }),
            onlyMissing: false,
            force: true,
            requestedBy: actor.sub,
            metadataBindingId: binding.id,
          },
          maxAttempts: 3,
        },
      });
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId,
          action: 'media.metadata.match',
          outcome: 'allowed',
          code: 'media_metadata_match',
          details: {
            mediaId,
            scope: kind,
            provider: selected.provider,
            providerId: selected.providerId,
            providerTitle: selected.title,
            episodeOrder,
            affectedItems: affected.count,
            jobId: job.id,
          },
        },
      });
      return { binding, job, affectedItems: affected.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async setMetadataLock(actor: AuthenticatedUser, mediaId: string, locked: boolean) {
    const media = await this.prisma.mediaItem.findFirst({
      where: { id: mediaId, accountId: actor.accountId },
      select: { id: true, type: true, libraryId: true, seriesTitle: true },
    });
    if (!media) throw new NotFoundException({ code: 'media_missing', message: 'Media does not exist in this account' });
    const kind = media.type === 'movie' ? 'movie' : 'series';
    const localKey = kind === 'movie'
      ? media.id
      : media.seriesTitle?.normalize('NFKC').trim().toLocaleLowerCase('en-US') ?? media.id;
    const itemScope: Prisma.MediaItemWhereInput = kind === 'movie' || !media.seriesTitle
      ? { id: media.id, accountId: actor.accountId }
      : {
          accountId: actor.accountId,
          libraryId: media.libraryId,
          type: 'episode',
          seriesTitle: { equals: media.seriesTitle, mode: 'insensitive' },
        };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.mediaItem.updateMany({ where: itemScope, data: { metadataLocked: locked } });
      await tx.metadataBinding.updateMany({
        where: { accountId: actor.accountId, libraryId: media.libraryId, mediaType: kind, localKey },
        data: { locked },
      });
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId,
          action: 'media.metadata.lock',
          outcome: 'allowed',
          code: 'media_metadata_lock',
          details: { mediaId, locked, scope: kind, affectedItems: updated.count },
        },
      });
      return { id: mediaId, metadataLocked: locked, affectedItems: updated.count };
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
      file: { is: { status: 'ready' } },
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
