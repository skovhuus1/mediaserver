import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RegisterDeviceInput = {
  accountId?: string;
  userId?: string;
  input: {
    deviceName: string;
    deviceType: string;
    platform?: string;
    appVersion?: string;
    capabilities?: Record<string, unknown>;
  };
};

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listDevices(accountId?: string, userId?: string) {
    const where: Record<string, unknown> = {};
    if (accountId) {
      where.account_id = accountId;
    }
    if (userId) {
      where.user_id = userId;
    }
    return this.prisma.devices.findMany({
      where,
      orderBy: { last_seen_at: 'desc' },
    });
  }

  async registerDevice(payload: RegisterDeviceInput) {
    if (!payload.accountId || !payload.userId) {
      throw new BadRequestException({ code: 'missing_context', message: 'accountId og userId mangler' });
    }

    return this.prisma.devices.upsert({
      where: {
        account_id_device_name_key: {
          account_id: payload.accountId,
          device_name: payload.input.deviceName,
        },
      },
      create: {
        account_id: payload.accountId,
        user_id: payload.userId,
        device_name: payload.input.deviceName,
        device_type: payload.input.deviceType,
        platform: payload.input.platform,
        app_version: payload.input.appVersion,
        capabilities: payload.input.capabilities ?? {},
      },
      update: {
        last_seen_at: new Date(),
        platform: payload.input.platform ?? undefined,
        app_version: payload.input.appVersion ?? undefined,
        capabilities: payload.input.capabilities ?? undefined,
      },
    });
  }

  async revokeDevice(accountId: string, deviceId: string) {
    const updated = await this.prisma.devices.updateMany({
      where: { account_id: accountId, id: deviceId },
      data: { is_revoked: true, last_seen_at: new Date() },
    });

    return { revoked: updated.count > 0 };
  }
}
