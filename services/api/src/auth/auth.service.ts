import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppRole } from '../common/constants';
import { sha256 } from '../common/utils/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RefreshDto, RegisterAdminDto, LogoutDto } from './dto';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async whoAmI() {
    return { message: 'Authenticated endpoint; include Authorization bearer token with request to identify user' };
  }

  async registerAdmin(dto: RegisterAdminDto): Promise<TokenPair & { user: Record<string, unknown> }> {
    const totalAccounts = await this.prisma.accounts.count();
    if (totalAccounts > 0) {
      throw new BadRequestException({
        code: 'bootstrap_not_allowed',
        message: 'Bootstrap route is disabled after initial setup',
      });
    }

    const role = await this.getOrCreateRole(AppRole.ADMIN);

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.accounts.create({
        data: {
          name: dto.accountName,
          server_name: dto.serverName ?? 'BoltBytes Media',
          external_url: dto.externalUrl,
          language: dto.language ?? 'da',
          timezone: dto.timezone ?? 'Europe/Copenhagen',
        },
      });

      const hash = await bcrypt.hash(dto.adminPassword, 12);
      const user = await tx.users.create({
        data: {
          account_id: account.id,
          email: dto.adminEmail,
          display_name: dto.adminDisplayName,
          password_hash: hash,
          status: 'active',
          user_roles: {
            create: {
              role_id: role.id,
            },
          },
        },
      });

      await tx.profiles.create({
        data: {
          account_id: account.id,
          user_id: user.id,
          name: dto.adminDisplayName,
          is_child_profile: false,
        },
      });

      await tx.storage_roots.create({
        data: {
          account_id: account.id,
          label: 'default',
          mount_path: dto.mountPath ?? '/media',
          type: 'local',
        },
      });

      const { accessToken, refreshToken, expiresIn } = await this.issueSession(user.id, account.id, null, [role.code]);
      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn,
        user: {
          id: user.id,
          email: user.email,
          accountId: user.account_id,
          roles: [role.code],
        },
      };
    });
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: Record<string, unknown> }> {
    const user = await this.prisma.users.findFirst({
      where: { email: dto.email },
      include: {
        accounts: true,
        user_roles: {
          include: { roles: true },
        },
        profiles: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Ugyldigt login',
      });
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException({ code: 'user_inactive', message: 'Brugeren er inaktiv' });
    }

    if (user.accounts.status !== 'active') {
      throw new UnauthorizedException({ code: 'account_disabled', message: 'Konto deaktiveret' });
    }

    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Ugyldigt login' });
    }

    const roles = user.user_roles.map((entry) => entry.roles.code);
    const activeProfileId = user.profiles[0]?.id ?? null;
    const deviceId = await this.ensureDevice(user, dto);
    const profileId = activeProfileId;

    const { accessToken, refreshToken, expiresIn } = await this.issueSession(
      user.id,
      user.account_id,
      profileId,
      roles,
      deviceId,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        accountId: user.account_id,
        roles,
        activeProfileId,
      },
    };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const hash = sha256(dto.refreshToken);
    const tokenRow = await this.prisma.refresh_tokens.findUnique({
      where: { token_hash: hash },
      include: {
        users: {
          include: {
            accounts: true,
            user_roles: { include: { roles: true } },
            profiles: true,
          },
        },
      },
    });

    if (!tokenRow || tokenRow.revoked_at || tokenRow.expires_at < new Date() || !tokenRow.users) {
      throw new UnauthorizedException({ code: 'invalid_refresh', message: 'Refresh-token er ugyldigt' });
    }

    if (tokenRow.users.status !== 'active' || tokenRow.users.accounts.status !== 'active') {
      throw new UnauthorizedException({ code: 'account_locked', message: 'Bruger/ konto er ikke aktiv' });
    }

    const roles = tokenRow.users.user_roles.map((entry) => entry.roles.code);
    await this.prisma.refresh_tokens.updateMany({
      where: { id: tokenRow.id },
      data: { revoked_at: new Date() },
    });

    const profileId = dto.profileId ?? tokenRow.users.profiles[0]?.id ?? null;
    await this.markRefreshTokenUsed(hash);

    const { accessToken, refreshToken, expiresIn } = await this.issueSession(
      tokenRow.users.id,
      tokenRow.users.account_id,
      profileId,
      roles,
      tokenRow.device_id,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  async logout(dto: LogoutDto): Promise<{ success: boolean }> {
    const hash = sha256(dto.refreshToken);
    await this.prisma.refresh_tokens.updateMany({
      where: { token_hash: hash },
      data: { revoked_at: new Date() },
    });
    return { success: true };
  }

  private async ensureDevice(user: { id: string; account_id: string }, dto: LoginDto) {
    if (dto.deviceId) {
      const existing = await this.prisma.devices.findFirst({
        where: {
          id: dto.deviceId,
          account_id: user.account_id,
          user_id: user.id,
        },
      });

      if (existing) {
        await this.prisma.devices.update({
          where: { id: existing.id },
          data: {
            last_seen_at: new Date(),
            is_revoked: false,
            device_name: dto.deviceName ?? existing.device_name,
            device_type: dto.deviceType ?? existing.device_type,
            platform: dto.platform ?? existing.platform,
            app_version: dto.appVersion ?? existing.app_version,
          },
        });
        return existing.id;
      }
    }

    const device = await this.prisma.devices.create({
      data: {
        account_id: user.account_id,
        user_id: user.id,
        device_name: dto.deviceName ?? 'web-browser',
        device_type: dto.deviceType ?? 'web',
        platform: dto.platform,
        app_version: dto.appVersion,
        capabilities: {},
      },
    });
    return device.id;
  }

  private async issueSession(
    userId: string,
    accountId: string,
    profileId: string | null,
    roles: string[],
    deviceId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      accountId,
      profileId,
      roles,
      deviceId,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshHash = sha256(refreshToken);
    const refreshTtl = this.parseDurationDays(this.configService.get('JWT_REFRESH_TTL', '30d'));
    const expiresAt = new Date(Date.now() + refreshTtl * 24 * 60 * 60 * 1000);
    const familyId = randomBytes(16).toString('hex');

    await this.prisma.refresh_tokens.create({
      data: {
        token_hash: refreshHash,
        user_id: userId,
        account_id: accountId,
        device_id: deviceId ?? 'unknown-device',
        family_id: familyId,
        expires_at: expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('JWT_ACCESS_TTL', '15m'),
    };
  }

  private async getOrCreateRole(code: string) {
    const existing = await this.prisma.roles.findUnique({ where: { code } });
    if (existing) {
      return existing;
    }

    return this.prisma.roles.create({
      data: { code, description: 'Seeded role' },
    });
  }

  private parseDurationDays(raw: string) {
    if (!raw || !raw.endsWith('d')) {
      return 30;
    }
    return Number.parseInt(raw.replace(/d$/i, ''), 10) || 30;
  }

  private async markRefreshTokenUsed(tokenHash: string) {
    await this.prisma.refresh_tokens.updateMany({
      where: { token_hash: tokenHash },
      data: { last_used_at: new Date() },
    });
  }
}

