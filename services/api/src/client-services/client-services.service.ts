import { createHash } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterPushDto,
  ReportClientCrashDto,
  TestNotificationDto,
} from './client-services.dto';

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|session/i;
const SENSITIVE_QUERY = /([?&](?:token|access_token|refreshToken|streamToken)=)[^&\s]+/gi;

@Injectable()
export class ClientServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPush(actor: AuthenticatedUser, dto: RegisterPushDto) {
    const now = new Date();
    const registration = await this.prisma.$transaction(async (tx) => {
      await tx.clientPushRegistration.updateMany({
        where: { deviceId: requireDeviceId(actor), token: { not: dto.token } },
        data: { enabled: false, updatedAt: now },
      });
      return tx.clientPushRegistration.upsert({
        where: { token: dto.token },
        create: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId ?? null,
          deviceId: requireDeviceId(actor),
          token: dto.token,
          platform: dto.platform,
          appVersion: dto.appVersion ?? null,
          lastSeenAt: now,
        },
        update: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId ?? null,
          deviceId: requireDeviceId(actor),
          platform: dto.platform,
          appVersion: dto.appVersion ?? null,
          enabled: true,
          lastSeenAt: now,
        },
        select: { id: true, platform: true, enabled: true, lastSeenAt: true },
      });
    });
    await this.audit(actor, 'client.push.registered', registration.id, {
      platform: dto.platform,
      appVersion: dto.appVersion,
    });
    return registration;
  }

  async unregisterPush(actor: AuthenticatedUser) {
    const result = await this.prisma.clientPushRegistration.updateMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        deviceId: requireDeviceId(actor),
        enabled: true,
      },
      data: { enabled: false },
    });
    await this.audit(actor, 'client.push.unregistered', requireDeviceId(actor), {
      registrations: result.count,
    });
    return { disabled: result.count };
  }

  async notifications(actor: AuthenticatedUser) {
    const items = await this.prisma.userNotification.findMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        ...(actor.profileId
          ? { OR: [{ profileId: null }, { profileId: actor.profileId }] }
          : { profileId: null }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items };
  }

  async readNotification(actor: AuthenticatedUser, id: string) {
    const notification = await this.prisma.userNotification.findFirst({
      where: { id, accountId: actor.accountId, userId: actor.sub },
      select: { id: true },
    });
    if (!notification) throw new NotFoundException('Notification was not found');
    return this.prisma.userNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async readAll(actor: AuthenticatedUser) {
    const result = await this.prisma.userNotification.updateMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        readAt: null,
        ...(actor.profileId
          ? { OR: [{ profileId: null }, { profileId: actor.profileId }] }
          : { profileId: null }),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async testNotification(actor: AuthenticatedUser, dto: TestNotificationDto) {
    const registrations = await this.prisma.clientPushRegistration.findMany({
      where: {
        accountId: actor.accountId,
        userId: actor.sub,
        enabled: true,
      },
      select: { id: true },
    });
    const notification = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userNotification.create({
        data: {
          accountId: actor.accountId,
          userId: actor.sub,
          profileId: actor.profileId ?? null,
          type: 'test',
          title: dto.title?.trim() || 'BoltBytes Media',
          body: dto.body?.trim() || 'Push-notifikationer virker på denne enhed.',
          data: { route: '/notifications' },
          deliveryStatus: registrations.length > 0 ? 'queued' : 'in_app_only',
        },
      });
      for (const registration of registrations) {
        await tx.systemJob.create({
          data: {
            accountId: actor.accountId,
            type: 'notification.push',
            status: 'queued',
            payload: {
              notificationId: created.id,
              registrationId: registration.id,
            },
            maxAttempts: 4,
          },
        });
      }
      return created;
    });
    return notification;
  }

  async reportCrash(actor: AuthenticatedUser, dto: ReportClientCrashDto) {
    const requestedAt = new Date(dto.occurredAt);
    const now = Date.now();
    const occurredAt = requestedAt.getTime() > now + 5 * 60 * 1000 ||
      requestedAt.getTime() < now - 90 * 24 * 60 * 60 * 1000
      ? new Date(now)
      : requestedAt;
    const context = sanitizeCrashContext(dto.context ?? {});
    const message = redact(dto.message).slice(0, 4000);
    const stack = dto.stack ? redact(dto.stack).slice(0, 32000) : null;
    const fingerprint = createHash('sha256')
      .update([dto.kind, message, stack?.split('\n').slice(0, 4).join('\n')].join('\n'))
      .digest('hex');
    const recent = await this.prisma.clientCrashReport.findFirst({
      where: {
        accountId: actor.accountId,
        deviceId: requireDeviceId(actor),
        fingerprint,
        lastOccurredAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
      orderBy: { lastOccurredAt: 'desc' },
    });
    if (recent) {
      return this.prisma.clientCrashReport.update({
        where: { id: recent.id },
        data: {
          occurrences: { increment: 1 },
          lastOccurredAt: occurredAt,
          context: context as Prisma.InputJsonValue,
        },
        select: { id: true, occurrences: true, lastOccurredAt: true },
      });
    }
    return this.prisma.clientCrashReport.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId ?? null,
        deviceId: requireDeviceId(actor),
        platform: dto.platform,
        appVersion: dto.appVersion ?? null,
        kind: dto.kind,
        message,
        stack,
        context: context as Prisma.InputJsonValue,
        fingerprint,
        occurredAt,
        lastOccurredAt: occurredAt,
      },
      select: { id: true, occurrences: true, lastOccurredAt: true },
    });
  }

  async crashes(actor: AuthenticatedUser) {
    return {
      items: await this.prisma.clientCrashReport.findMany({
        where: { accountId: actor.accountId },
        orderBy: { lastOccurredAt: 'desc' },
        take: 200,
      }),
    };
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    targetId: string,
    details: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        accountId: actor.accountId,
        userId: actor.sub,
        profileId: actor.profileId ?? null,
        action,
        outcome: 'success',
        code: 'ok',
        details: { targetId, ...details } as Prisma.InputJsonValue,
      },
    });
  }
}

export function sanitizeCrashContext(
  value: unknown,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4 || value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = '[redacted]';
    } else if (typeof item === 'string') {
      output[key] = redact(item).slice(0, 2000);
    } else if (typeof item === 'number' || typeof item === 'boolean' || item == null) {
      output[key] = item;
    } else if (Array.isArray(item)) {
      output[key] = item.slice(0, 20).map((entry) =>
        typeof entry === 'string' ? redact(entry).slice(0, 500) : String(entry).slice(0, 500),
      );
    } else {
      output[key] = sanitizeCrashContext(item, depth + 1);
    }
  }
  return output;
}

function redact(value: string): string {
  return value
    .replace(SENSITIVE_QUERY, '$1[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]');
}

function requireDeviceId(actor: AuthenticatedUser): string {
  if (!actor.deviceId) {
    throw new UnauthorizedException({
      code: 'device_context_required',
      message: 'An authenticated device is required for this operation',
    });
  }
  return actor.deviceId;
}
