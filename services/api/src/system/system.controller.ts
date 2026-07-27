import { BadRequestException, Body, Controller, Get, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import * as promClient from 'prom-client';
import { AppRole } from '../common/constants';
import { Public } from '../common/decorators/public.decorator';
import { encryptSecret, decryptSecret } from '../common/utils/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService, BillingWebhookPayload } from '../billing/billing.service';

type SetupDto = {
  accountName: string;
  adminEmail: string;
  adminPassword: string;
  serverName?: string;
  externalUrl?: string;
  language?: string;
  timezone?: string;
  mountPath?: string;
  clientSecret?: string;
};

@Controller('system')
@ApiTags('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  @Get('health')
  @Public()
  async health() {
    const activeStreams = await this.prisma.playback_sessions.count({
      where: { status: { in: ['active', 'reserving', 'paused'] } },
    });

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      activeStreams,
      db: 'connected',
      version: '0.1.0',
    };
  }

  @Get('ready')
  @Public()
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        code: 'dependency_unavailable',
        message: 'Database unavailable',
      });
    }
  }

  @Get('metrics')
  @Public()
  async metrics() {
    return promClient.register.metrics();
  }

  @Public()
  @Post('setup')
  @HttpCode(201)
  async setup(@Body() dto: SetupDto) {
    const count = await this.prisma.accounts.count();
    if (count > 0) {
      throw new BadRequestException({ code: 'already_bootstrapped', message: 'Systemet er allerede sat op' });
    }

    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new BadRequestException({
        code: 'missing_encryption_key',
        message: 'Missing ENCRYPTION_KEY environment variable',
      });
    }

    const mountPath = this.normalizeMountPath(dto.mountPath);

    await Promise.all(
      Object.values(AppRole).map((code) =>
        this.prisma.roles.upsert({
          where: { code },
          create: { code, description: 'System role bootstrap' },
          update: {},
        }),
      ),
    );

    const adminRole = await this.prisma.roles.findUnique({ where: { code: AppRole.ADMIN } });
    if (!adminRole) {
      throw new BadRequestException({ code: 'role_seed_failed', message: 'Kunne ikke oprette admin rolle' });
    }

    const account = await this.prisma.accounts.create({
      data: {
        name: dto.accountName,
        server_name: dto.serverName ?? 'BoltBytes Media',
        external_url: dto.externalUrl,
        language: dto.language ?? 'da',
        timezone: dto.timezone ?? 'Europe/Copenhagen',
      },
    });

    const adminUser = await this.prisma.users.create({
      data: {
        account_id: account.id,
        email: dto.adminEmail,
        display_name: 'Administrator',
        password_hash: await bcrypt.hash(dto.adminPassword, 12),
        user_roles: {
          create: { role_id: adminRole.id },
        },
      },
    });

    await this.prisma.storage_roots.create({
      data: {
        account_id: account.id,
        label: 'default',
        mount_path: mountPath,
        type: 'local',
        is_readonly: false,
      },
    });

    await this.prisma.system_settings.create({
      data: {
        account_id: account.id,
        setting_key: 'setup_secrets',
        setting_value: JSON.stringify({
          encrypted: true,
          createdAt: new Date().toISOString(),
          bootstrapId: randomUUID(),
          clientSecret: dto.clientSecret ? encryptSecret(dto.clientSecret, encryptionKey) : null,
        }),
      },
    });

    return {
      status: 'setup_complete',
      accountId: account.id,
      adminUserId: adminUser.id,
      accountName: account.name,
    };
  }

  @Public()
  @Get('setup/secret-check')
  async secretCheck() {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    const setting = await this.prisma.system_settings.findFirst({
      where: { setting_key: 'setup_secrets' },
    });

    if (!setting || !encryptionKey) {
      return { canDecryptStoredSecret: false };
    }

    try {
      const parsed = JSON.parse(setting.setting_value);
      const decrypted = parsed.clientSecret ? decryptSecret(parsed.clientSecret, encryptionKey) : null;
      return { canDecryptStoredSecret: Boolean(decrypted) };
    } catch {
      return { canDecryptStoredSecret: false };
    }
  }

  @Public()
  @Post('webhook/billing')
  @HttpCode(202)
  async billingWebhook(@Body() payload: BillingWebhookPayload) {
    return this.billingService.ingestWebhook(payload);
  }

  private normalizeMountPath(rawValue?: string) {
    const raw = (rawValue ?? '/media').trim();
    if (!raw) {
      return '/media';
    }

    if (!raw.startsWith('/')) {
      throw new BadRequestException({ code: 'invalid_mount_path', message: 'Mount-sti skal starte med /' });
    }

    if (raw.includes('..') || /[\u0000\r\n]/.test(raw)) {
      throw new BadRequestException({ code: 'invalid_mount_path', message: 'Mount-sti indeholder ugyldige tegn' });
    }

    return raw.replace(/\/+$/, '') || '/';
  }
}

