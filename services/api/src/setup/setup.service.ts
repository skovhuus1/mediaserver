import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SetupRequestDto } from './setup.dto';

const DEFAULT_ENTITLEMENTS = {
  maxConcurrentStreams: 1,
  maxRegisteredDevices: 5,
  maxVideoResolution: 1080,
  maxVideoBitrate: 12_000,
  allowDirectPlay: true,
  allowDirectStream: true,
  allowVideoTranscode: false,
  allowAudioTranscode: true,
  allowSubtitleBurnIn: false,
  allowChromecast: true,
  allowOfflineDownload: false,
  releaseDelayMonths: 0,
  releaseDelayDays: 0,
} as const;

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<{ configured: boolean }> {
    return { configured: Boolean(await this.prisma.systemBootstrap.findUnique({ where: { id: 'singleton' } })) };
  }

  async configure(dto: SetupRequestDto): Promise<{ configured: true; accountId: string; adminUserId: string }> {
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
            mountPath: (dto.mountPath ?? '/media').replace(/\/+$/, '') || '/',
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
}
