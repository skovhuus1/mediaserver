import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { Prisma } from '@prisma/client';
import { readdir, realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStorageBrowsePath } from '../setup/storage-path';
import { BrowseLibraryDirectoriesDto, CreateLibraryDto, CreateMediaDto } from './catalog.dto';
import { resolveLibraryPath } from './path-policy';

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
    return this.prisma.library.create({
      data: {
        accountId: actor.accountId,
        storageRootId: root.id,
        name: dto.name.trim(),
        type: dto.type,
        paths: { create: { path: resolvedPath, recursive: dto.recursive } },
      },
      include: { paths: true },
    });
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
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map((item) => ({
      ...item,
      file: item.file ? { ...item.file, sizeBytes: item.file.sizeBytes.toString() } : null,
    }));
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
}
