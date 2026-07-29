import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { isPrivileged } from '../common/auth';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEntitlementOverrideDto,
  CreatePlanDto,
  CreatePlanVersionDto,
  CreateProfileDto,
  CreateSubscriptionDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
} from './administration.dto';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(actor: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: { accountId: actor.accountId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        profiles: {
          select: {
            id: true,
            name: true,
            isChildProfile: true,
            language: true,
            pinHash: true,
            archivedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        subscriptions: {
          select: {
            id: true,
            status: true,
            planVersionId: true,
            startsAt: true,
            endsAt: true,
            planVersion: { select: { version: true, plan: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
        },
        roles: { select: { role: { select: { code: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((user) => ({
      ...user,
      profiles: user.profiles.map(({ pinHash, ...profile }) => ({ ...profile, hasPin: Boolean(pinHash) })),
    }));
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto) {
    const userRole = await this.prisma.role.upsert({
      where: { code: 'user' },
      create: { code: 'user', description: 'Media user' },
      update: {},
    });
    const temporaryPassword = dto.password ?? randomBytes(15).toString('base64url');
    const planVersion = dto.planVersionId
      ? await this.prisma.planVersion.findFirst({
        where: { id: dto.planVersionId, plan: { accountId: actor.accountId } },
      })
      : null;
    if (dto.planVersionId && !planVersion) {
      throw new BadRequestException({ code: 'plan_version_invalid', message: 'Plan version does not belong to this account' });
    }
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            accountId: actor.accountId,
            email: dto.email.trim().toLowerCase(),
            displayName: dto.displayName.trim(),
            passwordHash: await hash(temporaryPassword, 12),
            mustChangePassword: true,
            roles: { create: { roleId: userRole.id } },
            profiles: {
              create: {
                accountId: actor.accountId,
                name: dto.profileName?.trim() || dto.displayName.trim(),
              },
            },
          },
          select: { id: true, email: true, displayName: true, status: true, mustChangePassword: true },
        });
        if (planVersion) {
          await tx.subscription.create({
            data: {
              accountId: actor.accountId,
              userId: created.id,
              planVersionId: planVersion.id,
              status: 'active',
              snapshot: {
                create: {
                  snapshot: {
                    planVersionId: planVersion.id,
                    planSnapshot: planVersion.snapshot,
                    capturedAt: new Date().toISOString(),
                  },
                },
              },
              events: { create: { type: 'created', payload: { source: 'manual', actorId: actor.sub } } },
            },
          });
        }
        return created;
      });
      await this.audit(actor, 'user.created', user.id, { planVersionId: planVersion?.id ?? null });
      return { ...user, temporaryPassword };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'email_exists', message: 'A user with this email already exists in the account' });
      }
      throw error;
    }
  }

  async updateUser(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto) {
    const user = await this.ownedUser(actor, userId);
    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.displayName ? { displayName: dto.displayName.trim() } : {}),
        },
        select: { id: true, email: true, displayName: true, status: true },
      });
      await this.audit(actor, 'user.updated', user.id, {});
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'email_exists', message: 'A user with this email already exists in the account' });
      }
      throw error;
    }
  }

  async resetPassword(actor: AuthenticatedUser, userId: string) {
    const user = await this.ownedUser(actor, userId);
    const temporaryPassword = randomBytes(15).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hash(temporaryPassword, 12), mustChangePassword: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.playbackSession.updateMany({
        where: { userId: user.id, status: { in: ['reserving', 'active', 'paused'] } },
        data: { status: 'terminated_by_admin', endedAt: now, leaseExpiresAt: now },
      }),
      this.prisma.streamReservation.updateMany({
        where: { userId: user.id, releasedAt: null },
        data: { releasedAt: now, reason: 'password_reset' },
      }),
    ]);
    await this.audit(actor, 'user.password_reset', user.id, {});
    return { id: user.id, temporaryPassword, mustChangePassword: true };
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
    await this.audit(actor, suspended ? 'user.suspended' : 'user.reactivated', user.id, {});
    return { id: user.id, status: suspended ? 'suspended' : 'active' };
  }

  async listProfiles(actor: AuthenticatedUser) {
    const profiles = await this.prisma.profile.findMany({
      where: { accountId: actor.accountId, ...(isPrivileged(actor) ? {} : { userId: actor.sub }) },
      select: { id: true, userId: true, name: true, isChildProfile: true, language: true, pinHash: true, archivedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return profiles.map(({ pinHash, ...profile }) => ({ ...profile, hasPin: Boolean(pinHash) }));
  }

  async createProfile(actor: AuthenticatedUser, dto: CreateProfileDto) {
    const userId = isPrivileged(actor) && dto.userId ? dto.userId : actor.sub;
    const user = await this.prisma.user.findFirst({ where: { id: userId, accountId: actor.accountId } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'Profile owner was not found in this account' });
    const created = await this.prisma.profile.create({
      data: {
        accountId: actor.accountId,
        userId: user.id,
        name: dto.name.trim(),
        isChildProfile: dto.isChildProfile,
        language: dto.language ?? 'da',
        pinHash: dto.pin ? await hash(dto.pin, 12) : null,
      },
      select: { id: true, userId: true, name: true, isChildProfile: true, language: true },
    });
    await this.audit(actor, 'profile.created', created.id, { userId: user.id });
    return created;
  }

  async updateProfile(actor: AuthenticatedUser, profileId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, accountId: actor.accountId },
    });
    if (!profile) throw new NotFoundException({ code: 'profile_not_found', message: 'Profile was not found in this account' });
    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.isChildProfile !== undefined ? { isChildProfile: dto.isChildProfile } : {}),
        ...(dto.language ? { language: dto.language } : {}),
        ...(dto.clearPin ? { pinHash: null } : dto.pin ? { pinHash: await hash(dto.pin, 12) } : {}),
      },
      select: { id: true, userId: true, name: true, isChildProfile: true, language: true, pinHash: true, archivedAt: true },
    });
    await this.audit(actor, 'profile.updated', profile.id, { userId: profile.userId });
    const { pinHash, ...safe } = updated;
    return { ...safe, hasPin: Boolean(pinHash) };
  }

  async archiveProfile(actor: AuthenticatedUser, profileId: string, archived: boolean) {
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, accountId: actor.accountId },
    });
    if (!profile) throw new NotFoundException({ code: 'profile_not_found', message: 'Profile was not found in this account' });
    if (archived && !profile.archivedAt) {
      const activeProfiles = await this.prisma.profile.count({
        where: { userId: profile.userId, accountId: actor.accountId, archivedAt: null },
      });
      if (activeProfiles <= 1) {
        throw new BadRequestException({ code: 'last_profile_required', message: 'The last active profile cannot be archived' });
      }
    }
    const now = new Date();
    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: { archivedAt: archived ? now : null },
      select: { id: true, userId: true, archivedAt: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: profile.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.audit(actor, archived ? 'profile.archived' : 'profile.restored', profile.id, { userId: profile.userId });
    return updated;
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
      this.prisma.playbackSession.updateMany({
        where: { deviceId: device.id, status: { in: ['reserving', 'active', 'paused'] } },
        data: { status: 'terminated_by_admin', endedAt: now, leaseExpiresAt: now },
      }),
      this.prisma.streamReservation.updateMany({
        where: { playbackSession: { deviceId: device.id }, releasedAt: null },
        data: { releasedAt: now, reason: 'device_revoked' },
      }),
    ]);
    await this.audit(actor, 'device.revoked', device.id, { userId: device.userId });
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
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('bbmedia:plan-version'),
          hashtext(CAST(${dto.planId} AS text))
        )::text AS lock_result
      `;
      const plan = await tx.plan.findFirst({ where: { id: dto.planId, accountId: actor.accountId } });
      if (!plan) throw new NotFoundException({ code: 'plan_not_found', message: 'Plan was not found in this account' });
      const latest = await tx.planVersion.findFirst({ where: { planId: plan.id }, orderBy: { version: 'desc' } });
      if (dto.isActive) await tx.planVersion.updateMany({ where: { planId: plan.id, isActive: true }, data: { isActive: false } });
      const version = await tx.planVersion.create({
        data: {
          planId: plan.id,
          version: (latest?.version ?? 0) + 1,
          isActive: dto.isActive,
          ...dto.entitlements,
          snapshot: { ...dto.entitlements } as Prisma.InputJsonObject,
          entitlement: { create: { snapshot: { ...dto.entitlements } as Prisma.InputJsonObject } },
        },
      });
      let migratedSubscriptions = 0;
      if (dto.isActive && dto.migrateActiveSubscriptions) {
        const now = new Date();
        const subscriptions = await tx.subscription.findMany({
          where: {
            accountId: actor.accountId,
            planVersion: { planId: plan.id },
            status: { in: ['active', 'trialing', 'grace_period'] },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
        });
        for (const subscription of subscriptions) {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'canceled',
              endsAt: now,
              events: {
                create: {
                  type: 'plan_version_migrated',
                  payload: {
                    previousPlanVersionId: subscription.planVersionId,
                    nextPlanVersionId: version.id,
                    requestedBy: actor.sub,
                  },
                },
              },
            },
          });
          const replacement = await tx.subscription.create({
            data: {
              accountId: subscription.accountId,
              userId: subscription.userId,
              planVersionId: version.id,
              status: subscription.status,
              startsAt: now,
              endsAt: subscription.endsAt,
              events: {
                create: {
                  type: 'created',
                  payload: {
                    source: 'plan_version_migration',
                    previousSubscriptionId: subscription.id,
                    requestedBy: actor.sub,
                  },
                },
              },
            },
          });
          await tx.subscriptionSnapshot.create({
            data: {
              subscriptionId: replacement.id,
              snapshot: {
                planVersionId: version.id,
                entitlements: { ...dto.entitlements },
                previousSubscriptionId: subscription.id,
                capturedAt: now.toISOString(),
              },
            },
          });
          migratedSubscriptions += 1;
        }
      }
      await tx.auditLog.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          action: 'plan.version_create',
          outcome: 'success',
          code: 'plan_version_created',
          details: {
            planId: plan.id,
            planVersionId: version.id,
            version: version.version,
            isActive: version.isActive,
            migratedSubscriptions,
          },
        },
      });
      return { ...version, migratedSubscriptions };
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
    const existing = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['pending', 'trialing', 'active', 'grace_period'] } },
    });
    if (existing) {
      throw new ConflictException({ code: 'active_subscription_exists', message: 'User already has an active subscription' });
    }
    const created = await this.prisma.subscription.create({
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
    await this.audit(actor, 'subscription.created', created.id, {
      userId: dto.userId,
      planVersionId: dto.planVersionId,
    });
    return created;
  }

  async changeSubscriptionPlan(actor: AuthenticatedUser, subscriptionId: string, planVersionId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const [subscription, version] = await Promise.all([
        tx.subscription.findFirst({ where: { id: subscriptionId, accountId: actor.accountId } }),
        tx.planVersion.findFirst({ where: { id: planVersionId, plan: { accountId: actor.accountId } } }),
      ]);
      if (!subscription || !version) {
        throw new BadRequestException({ code: 'subscription_scope_invalid', message: 'Subscription and plan version must belong to this account' });
      }
      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planVersionId: version.id,
          snapshot: {
            upsert: {
              create: {
                snapshot: {
                  planVersionId: version.id,
                  planSnapshot: version.snapshot,
                  capturedAt: new Date().toISOString(),
                },
              },
              update: {
                snapshot: {
                  planVersionId: version.id,
                  planSnapshot: version.snapshot,
                  capturedAt: new Date().toISOString(),
                },
              },
            },
          },
          events: {
            create: {
              type: 'plan_changed',
              payload: {
                source: 'manual',
                actorId: actor.sub,
                previousPlanVersionId: subscription.planVersionId,
                planVersionId: version.id,
              },
            },
          },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit(actor, 'subscription.plan_changed', created.id, { planVersionId });
    return created;
  }

  async cancelSubscription(actor: AuthenticatedUser, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, accountId: actor.accountId } });
    if (!subscription) throw new NotFoundException({ code: 'subscription_not_found', message: 'Subscription was not found in this account' });
    const canceled = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'canceled',
        endsAt: new Date(),
        events: { create: { type: 'canceled', payload: { source: 'manual', actorId: actor.sub } } },
      },
    });
    await this.audit(actor, 'subscription.canceled', canceled.id, { userId: canceled.userId });
    return canceled;
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
    const created = await this.prisma.entitlementOverride.create({
      data: {
        accountId: actor.accountId,
        userId: user.id,
        profileId: dto.profileId ?? null,
        values: dto.values as Prisma.InputJsonValue,
        reason: dto.reason.trim(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.audit(actor, 'entitlement_override.created', created.id, {
      userId: created.userId,
      profileId: created.profileId,
    });
    return created;
  }

  listOverrides(actor: AuthenticatedUser) {
    return this.prisma.entitlementOverride.findMany({
      where: { accountId: actor.accountId },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        profile: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteOverride(actor: AuthenticatedUser, overrideId: string) {
    const override = await this.prisma.entitlementOverride.findFirst({
      where: { id: overrideId, accountId: actor.accountId },
    });
    if (!override) throw new NotFoundException({ code: 'override_not_found', message: 'Entitlement override was not found' });
    await this.prisma.entitlementOverride.delete({ where: { id: override.id } });
    await this.audit(actor, 'entitlement_override.deleted', override.id, { userId: override.userId });
    return { deleted: true };
  }

  private async ownedUser(actor: AuthenticatedUser, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, accountId: actor.accountId } });
    if (!user) throw new NotFoundException({ code: 'user_not_found', message: 'User was not found in this account' });
    return user;
  }

  private async audit(actor: AuthenticatedUser, action: string, resourceId: string, details: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId,
        correlationId: correlationId(),
        action,
        outcome: 'allowed',
        code: action.replaceAll('.', '_'),
        details: { resourceId, ...details },
      },
    });
  }
}
