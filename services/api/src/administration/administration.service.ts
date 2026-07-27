import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEntitlementOverrideDto,
  CreatePlanDto,
  CreatePlanVersionDto,
  CreateProfileDto,
  CreateSubscriptionDto,
  CreateUserDto,
} from './administration.dto';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { accountId: actor.accountId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        profiles: { select: { id: true, name: true, isChildProfile: true } },
        roles: { select: { role: { select: { code: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto) {
    const userRole = await this.prisma.role.upsert({
      where: { code: 'user' },
      create: { code: 'user', description: 'Media user' },
      update: {},
    });
    try {
      return await this.prisma.user.create({
        data: {
          accountId: actor.accountId,
          email: dto.email.trim().toLowerCase(),
          displayName: dto.displayName.trim(),
          passwordHash: await hash(dto.password, 12),
          roles: { create: { roleId: userRole.id } },
          profiles: {
            create: {
              accountId: actor.accountId,
              name: dto.displayName.trim(),
            },
          },
        },
        select: { id: true, email: true, displayName: true, status: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'email_exists', message: 'A user with this email already exists in the account' });
      }
      throw error;
    }
  }

  async suspendUser(actor: AuthenticatedUser, userId: string, suspended: boolean) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, accountId: actor.accountId } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'User was not found in this account' });
    if (user.id === actor.sub && suspended) {
      throw new BadRequestException({ code: 'cannot_suspend_self', message: 'An administrator cannot suspend the active account used for this request' });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { status: suspended ? 'suspended' : 'active' } });
      if (suspended) {
        await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        const sessions = await tx.playbackSession.findMany({
          where: { userId: user.id, status: { in: ['reserving', 'active', 'paused'] } },
          select: { id: true },
        });
        const sessionIds = sessions.map(({ id }) => id);
        if (sessionIds.length) {
          await tx.playbackSession.updateMany({
            where: { id: { in: sessionIds } },
            data: { status: 'terminated_by_admin', endedAt: now, leaseExpiresAt: now },
          });
          await tx.streamReservation.updateMany({
            where: { playbackSessionId: { in: sessionIds }, releasedAt: null },
            data: { releasedAt: now, reason: 'user_suspended' },
          });
        }
      }
    });
    return { id: user.id, status: suspended ? 'suspended' : 'active' };
  }

  listProfiles(actor: AuthenticatedUser) {
    return this.prisma.profile.findMany({
      where: { accountId: actor.accountId, ...(isPrivileged(actor) ? {} : { userId: actor.sub }) },
      select: { id: true, userId: true, name: true, isChildProfile: true, language: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createProfile(actor: AuthenticatedUser, dto: CreateProfileDto) {
    const userId = isPrivileged(actor) && dto.userId ? dto.userId : actor.sub;
    const user = await this.prisma.user.findFirst({ where: { id: userId, accountId: actor.accountId } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'Profile owner was not found in this account' });
    return this.prisma.profile.create({
      data: {
        accountId: actor.accountId,
        userId: user.id,
        name: dto.name.trim(),
        isChildProfile: dto.isChildProfile,
      },
      select: { id: true, userId: true, name: true, isChildProfile: true },
    });
  }

  listDevices(actor: AuthenticatedUser) {
    return this.prisma.device.findMany({
      where: { accountId: actor.accountId, ...(isPrivileged(actor) ? {} : { userId: actor.sub }) },
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        platform: true,
        appVersion: true,
        isRevoked: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeDevice(actor: AuthenticatedUser, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        accountId: actor.accountId,
        ...(isPrivileged(actor) ? {} : { userId: actor.sub }),
      },
    });
    if (!device) throw new NotFoundException({ code: 'device_not_found', message: 'Device was not found' });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: device.id }, data: { isRevoked: true } }),
      this.prisma.refreshToken.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return { revoked: true };
  }

  listPlans(actor: AuthenticatedUser) {
    return this.prisma.plan.findMany({
      where: { accountId: actor.accountId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  async createPlan(actor: AuthenticatedUser, dto: CreatePlanDto) {
    const values = dto.entitlements;
    const snapshot = { ...values } as Prisma.InputJsonObject;
    return this.prisma.plan.create({
      data: {
        accountId: actor.accountId,
        name: dto.name.trim(),
        internalCode: dto.internalCode.trim().toLowerCase(),
        description: dto.description?.trim() ?? null,
        versions: {
          create: {
            version: 1,
            isActive: true,
            ...values,
            snapshot,
            entitlement: { create: { snapshot } },
          },
        },
      },
      include: { versions: true },
    });
  }

  async createPlanVersion(actor: AuthenticatedUser, dto: CreatePlanVersionDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.planId}))`;
      const plan = await tx.plan.findFirst({ where: { id: dto.planId, accountId: actor.accountId } });
      if (!plan) throw new NotFoundException({ code: 'plan_not_found', message: 'Plan was not found in this account' });
      const latest = await tx.planVersion.findFirst({ where: { planId: plan.id }, orderBy: { version: 'desc' } });
      if (dto.isActive) await tx.planVersion.updateMany({ where: { planId: plan.id, isActive: true }, data: { isActive: false } });
      return tx.planVersion.create({
        data: {
          planId: plan.id,
          version: (latest?.version ?? 0) + 1,
          isActive: dto.isActive,
          ...dto.entitlements,
          snapshot: { ...dto.entitlements } as Prisma.InputJsonObject,
          entitlement: { create: { snapshot: { ...dto.entitlements } as Prisma.InputJsonObject } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  listSubscriptions(actor: AuthenticatedUser) {
    return this.prisma.subscription.findMany({
      where: { accountId: actor.accountId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        planVersion: { include: { plan: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSubscription(actor: AuthenticatedUser, dto: CreateSubscriptionDto) {
    const [user, version] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: dto.userId, accountId: actor.accountId } }),
      this.prisma.planVersion.findFirst({ where: { id: dto.planVersionId, plan: { accountId: actor.accountId } } }),
    ]);
    if (!user || !version) throw new BadRequestException({ code: 'subscription_scope_invalid', message: 'User and plan version must belong to this account' });
    return this.prisma.subscription.create({
      data: {
        accountId: actor.accountId,
        userId: user.id,
        planVersionId: version.id,
        status: dto.status ?? 'active',
        snapshot: {
          create: {
            snapshot: {
              planVersionId: version.id,
              planSnapshot: version.snapshot,
              capturedAt: new Date().toISOString(),
            },
          },
        },
        events: { create: { type: 'created', payload: { source: 'manual', actorId: actor.sub } } },
      },
    });
  }

  async cancelSubscription(actor: AuthenticatedUser, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, accountId: actor.accountId } });
    if (!subscription) throw new NotFoundException({ code: 'subscription_not_found', message: 'Subscription was not found in this account' });
    return this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'canceled',
        endsAt: new Date(),
        events: { create: { type: 'canceled', payload: { source: 'manual', actorId: actor.sub } } },
      },
    });
  }

  async createOverride(actor: AuthenticatedUser, dto: CreateEntitlementOverrideDto) {
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, accountId: actor.accountId } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'Override user was not found in this account' });
    if (dto.profileId) {
      const profile = await this.prisma.profile.findFirst({
        where: { id: dto.profileId, accountId: actor.accountId, userId: user.id },
      });
      if (!profile) throw new BadRequestException({ code: 'profile_scope_invalid', message: 'Override profile does not belong to the selected user' });
    }
    return this.prisma.entitlementOverride.create({
      data: {
        accountId: actor.accountId,
        userId: user.id,
        profileId: dto.profileId ?? null,
        values: dto.values as Prisma.InputJsonValue,
        reason: dto.reason.trim(),
      },
    });
  }
}
