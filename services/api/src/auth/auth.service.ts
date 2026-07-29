import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { compare, hash as hashPassword } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { readEnvironment } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { CompletePasswordChangeDto, LoginDto, RefreshDto } from './auth.dto';
import { createPasswordChangeToken, verifyPasswordChangeToken } from './password-change-token';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly environment = readEnvironment();

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: {
        account: true,
        roles: { include: { role: true } },
        profiles: { where: { archivedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!user || !await compare(dto.password, user.passwordHash)) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Email or password is incorrect' });
    }
    if (user.status !== 'active' || user.account.status !== 'active') {
      throw new UnauthorizedException({ code: 'account_inactive', message: 'The user or account is not active' });
    }
    if (user.mustChangePassword) {
      return {
        passwordChangeRequired: true as const,
        passwordChangeToken: createPasswordChangeToken(
          user.id,
          user.accountId,
          user.passwordHash,
          this.environment.jwtSecret,
        ),
      };
    }

    const device = await this.prisma.device.upsert({
      where: { userId_fingerprint: { userId: user.id, fingerprint: dto.deviceFingerprint } },
      create: {
        accountId: user.accountId,
        userId: user.id,
        fingerprint: dto.deviceFingerprint,
        name: dto.deviceName,
        type: dto.deviceType,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        capabilities: {},
      },
      update: {
        name: dto.deviceName,
        type: dto.deviceType,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        isRevoked: false,
        lastSeenAt: new Date(),
      },
    });
    const roles = user.roles.map(({ role }) => role.code);
    const profileId = user.profiles.find((profile) => !profile.pinHash)?.id ?? null;
    const tokens = await this.issueTokens(user.id, user.accountId, device.id, profileId, roles);
    return {
      ...tokens,
      user: {
        id: user.id,
        accountId: user.accountId,
        email: user.email,
        displayName: user.displayName,
        profileId,
        roles,
      },
    };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const hash = tokenHash(dto.refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: {
        user: {
          include: {
            account: true,
            roles: { include: { role: true } },
            profiles: { where: { archivedAt: null } },
          },
        },
        device: true,
      },
    });
    if (!existing) throw this.invalidRefresh();
    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({ code: 'refresh_reuse_detected', message: 'Refresh token reuse was detected; the device session was revoked' });
    }
    if (
      existing.expiresAt <= new Date() ||
      existing.user.status !== 'active' ||
      existing.user.account.status !== 'active' ||
      existing.device.isRevoked
    ) throw this.invalidRefresh();

    const requestedProfile = dto.profileId
      ? existing.user.profiles.find((profile) => profile.id === dto.profileId)
      : undefined;
    if (dto.profileId && !requestedProfile) {
      throw new UnauthorizedException({ code: 'profile_not_owned', message: 'The selected profile does not belong to this user' });
    }
    if (requestedProfile?.pinHash && !dto.profilePin) {
      throw new UnauthorizedException({ code: 'profile_pin_required', message: 'The selected profile requires a PIN' });
    }
    if (requestedProfile?.pinHash && !await compare(dto.profilePin!, requestedProfile.pinHash)) {
      throw new UnauthorizedException({ code: 'profile_pin_invalid', message: 'The profile PIN is invalid' });
    }
    const currentProfile = existing.profileId
      ? existing.user.profiles.find((profile) => profile.id === existing.profileId)
      : undefined;
    const profileId = requestedProfile?.id
      ?? currentProfile?.id
      ?? existing.user.profiles.find((profile) => !profile.pinHash)?.id
      ?? null;
    const roles = existing.user.roles.map(({ role }) => role.code);
    const accessToken = await this.signAccess(existing.userId, existing.accountId, existing.deviceId, profileId, roles);
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.environment.jwtRefreshTtlDays * 86_400_000);

    const rotated = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (revoked.count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          tokenHash: tokenHash(refreshToken),
          familyId: existing.familyId,
          accountId: existing.accountId,
          userId: existing.userId,
          deviceId: existing.deviceId,
          profileId,
          expiresAt,
        },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!rotated) throw this.invalidRefresh();

    return { accessToken, refreshToken, expiresIn: this.environment.jwtAccessTtlSeconds };
  }

  async logout(actor: AuthenticatedUser, refreshToken: string): Promise<{ revoked: boolean }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: tokenHash(refreshToken), userId: actor.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count === 1 };
  }

  async completePasswordChange(dto: CompletePasswordChangeDto): Promise<{ completed: true }> {
    const tokenParts = dto.token.split('.');
    if (tokenParts.length !== 4) throw this.invalidPasswordChange();
    let candidate: { sub?: string; accountId?: string } = {};
    try {
      candidate = JSON.parse(Buffer.from(tokenParts[2]!, 'base64url').toString('utf8')) as typeof candidate;
    } catch {
      throw this.invalidPasswordChange();
    }
    if (!candidate.sub || !candidate.accountId) throw this.invalidPasswordChange();
    const user = await this.prisma.user.findFirst({
      where: { id: candidate.sub, accountId: candidate.accountId, status: 'active' },
      include: { account: true },
    });
    if (
      !user
      || user.account.status !== 'active'
      || !user.mustChangePassword
      || !verifyPasswordChangeToken(dto.token, user.passwordHash, this.environment.jwtSecret)
    ) throw this.invalidPasswordChange();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(dto.newPassword, 12), mustChangePassword: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { completed: true };
  }

  async me(actor: AuthenticatedUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.sub, accountId: actor.accountId },
      select: {
        id: true,
        accountId: true,
        email: true,
        displayName: true,
        status: true,
        mustChangePassword: true,
        profiles: {
          where: { archivedAt: null },
          select: { id: true, name: true, isChildProfile: true, language: true, pinHash: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException({ code: 'user_missing', message: 'Authenticated user no longer exists' });
    return {
      ...user,
      profiles: user.profiles.map(({ pinHash, ...profile }) => ({ ...profile, hasPin: Boolean(pinHash) })),
      roles: actor.roles,
      activeProfileId: actor.profileId,
    };
  }

  private async issueTokens(
    userId: string,
    accountId: string,
    deviceId: string,
    profileId: string | null,
    roles: string[],
  ): Promise<TokenPair> {
    const accessToken = await this.signAccess(userId, accountId, deviceId, profileId, roles);
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: tokenHash(refreshToken),
        familyId: randomBytes(24).toString('hex'),
        accountId,
        userId,
        deviceId,
        profileId,
        expiresAt: new Date(Date.now() + this.environment.jwtRefreshTtlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.environment.jwtAccessTtlSeconds };
  }

  private signAccess(
    userId: string,
    accountId: string,
    deviceId: string,
    profileId: string | null,
    roles: string[],
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, accountId, deviceId, profileId, roles } satisfies AuthenticatedUser,
      { expiresIn: this.environment.jwtAccessTtlSeconds },
    );
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({ code: 'invalid_refresh', message: 'Refresh token is invalid or expired' });
  }

  private invalidPasswordChange(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'password_change_token_invalid',
      message: 'Password change token is invalid, expired or already used',
    });
  }
}
