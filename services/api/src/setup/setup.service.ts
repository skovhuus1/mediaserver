import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { readdir, realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import { readEnvironment } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { SetupRequestDto } from './setup.dto';
import { hostDisplayPath, resolveStorageBrowsePath } from './storage-path';

const DEFAULT_ENTITLEMENTS = {
  maxConcurrentStreams: 1,
  maxRegisteredDevices: 5,
  maxVideoResolution: 2160,
  maxVideoBitrate: 50_000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: true,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: false,
  allowChromecast: true,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
} as const;

@Injectable()
export class SetupService {
  private readonly environment = readEnvironment();

  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<{ configured: boolean }> {
    return { configured: Boolean(await this.prisma.systemBootstrap.findUnique({ where: { id: 'singleton' } })) };
  }

  async browseDirectories(requestedPath?: string) {
    if ((await this.status()).configured) {
      throw new ConflictException({ code: 'already_configured', message: 'Directory browsing is only available before setup' });
    }

    const selected = await this.resolveDirectory(requestedPath);
    let entries;
    try {
      entries = await readdir(selected.realPath, { withFileTypes: true });
    } catch (error) {
      this.throwFilesystemError(error);
    }

    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name, 'da'))
      .map((entry) => {
        const path = posix.join(selected.path, entry.name);
        return {
          name: entry.name,
          path,
          hostPath: hostDisplayPath(this.environment.mediaHostPath, this.environment.mediaMountPath, path),
        };
      });

    return {
      mountRoot: this.environment.mediaMountPath,
      hostRoot: this.environment.mediaHostPath,
      currentPath: selected.path,
      currentHostPath: hostDisplayPath(
        this.environment.mediaHostPath,
        this.environment.mediaMountPath,
        selected.path,
      ),
      parentPath: selected.path === this.environment.mediaMountPath ? null : posix.dirname(selected.path),
      directories,
    };
  }

  async configure(dto: SetupRequestDto): Promise<{ configured: true; accountId: string; adminUserId: string }> {
    const selectedDirectory = await this.resolveDirectory(dto.mountPath);
    const passwordHash = await hash(dto.adminPassword, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            name: dto.accountName.trim(),
            serverName: dto.serverName.trim(),
            externalUrl: dto.externalUrl?.trim() ?? null,
            language: dto.language ?? 'da',
            timezone: dto.timezone ?? 'Europe/Copenhagen',
          },
        });

        await tx.systemBootstrap.create({ data: { id: 'singleton', accountId: account.id } });
        const adminRole = await tx.role.upsert({
          where: { code: 'admin' },
          create: { code: 'admin', description: 'Full server administration' },
          update: {},
        });
        await tx.role.upsert({
          where: { code: 'operator' },
          create: { code: 'operator', description: 'Operational media administration' },
          update: {},
        });
        await tx.role.upsert({
          where: { code: 'user' },
          create: { code: 'user', description: 'Media user' },
          update: {},
        });

        const admin = await tx.user.create({
          data: {
            accountId: account.id,
            email: dto.adminEmail,
            displayName: dto.adminDisplayName.trim(),
            passwordHash,
            roles: { create: { roleId: adminRole.id } },
          },
        });
        await tx.profile.create({
          data: {
            accountId: account.id,
            userId: admin.id,
            name: dto.adminDisplayName.trim(),
            language: dto.language ?? 'da',
          },
        });
        await tx.storageRoot.create({
          data: {
            accountId: account.id,
            label: 'media',
            mountPath: selectedDirectory.path,
            isReadOnly: true,
          },
        });

        const plan = await tx.plan.create({
          data: {
            accountId: account.id,
            name: 'Administrator',
            internalCode: 'administrator',
            description: 'Bootstrap plan with server-owner access',
          },
        });
        const version = await tx.planVersion.create({
          data: {
            planId: plan.id,
            version: 1,
            isActive: true,
            ...DEFAULT_ENTITLEMENTS,
            snapshot: DEFAULT_ENTITLEMENTS,
            entitlement: { create: { snapshot: DEFAULT_ENTITLEMENTS } },
          },
        });
        await tx.subscription.create({
          data: {
            accountId: account.id,
            userId: admin.id,
            planVersionId: version.id,
            status: 'active',
            snapshot: {
              create: {
                snapshot: {
                  planVersionId: version.id,
                  entitlements: DEFAULT_ENTITLEMENTS,
                  capturedAt: new Date().toISOString(),
                },
              },
            },
            events: {
              create: {
                type: 'created',
                payload: { source: 'bootstrap' },
              },
            },
          },
        });

        return { configured: true as const, accountId: account.id, adminUserId: admin.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'already_configured', message: 'The server has already been configured' });
      }
      throw error;
    }
  }

  private async resolveDirectory(requestedPath?: string): Promise<{ path: string; realPath: string }> {
    const requested = resolveStorageBrowsePath(
      this.environment.mediaMountPath,
      requestedPath ?? this.environment.mediaMountPath,
    );
    if (!requested) {
      throw new BadRequestException({
        code: 'path_outside_media_mount',
        message: 'The selected directory must stay inside the configured media mount',
      });
    }

    try {
      const [rootRealPath, selectedRealPath] = await Promise.all([
        realpath(this.environment.mediaMountPath),
        realpath(requested),
      ]);
      const resolvedInsideRoot = resolveStorageBrowsePath(rootRealPath, selectedRealPath);
      if (!resolvedInsideRoot) {
        throw new ForbiddenException({
          code: 'path_outside_media_mount',
          message: 'The selected directory resolves outside the configured media mount',
        });
      }

      const relativePath = posix.relative(rootRealPath, selectedRealPath);
      return {
        path: relativePath
          ? posix.join(this.environment.mediaMountPath, relativePath)
          : this.environment.mediaMountPath,
        realPath: selectedRealPath,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.throwFilesystemError(error);
    }
  }

  private throwFilesystemError(error: unknown): never {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new NotFoundException({
        code: 'media_directory_missing',
        message: 'The selected media directory does not exist',
      });
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new ForbiddenException({
        code: 'media_directory_unreadable',
        message: 'The selected media directory cannot be read by BoltBytes',
      });
    }
    throw error;
  }
}
