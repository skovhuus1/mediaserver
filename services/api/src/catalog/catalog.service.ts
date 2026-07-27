import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLibraryDto, CreateMediaDto } from './catalog.dto';
import { resolveLibraryPath } from './path-policy';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

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
