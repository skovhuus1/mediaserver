import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AppRole } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';

type CreateUserInput = {
  email: string;
  displayName: string;
  password: string;
  accountId?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureStandardRole() {
    const existing = await this.prisma.roles.findUnique({ where: { code: AppRole.STANDARD } });
    if (existing) {
      return existing;
    }

    return this.prisma.roles.create({
      data: {
        code: AppRole.STANDARD,
        description: 'Standard bruger',
      },
    });
  }

  async createUser(dto: CreateUserInput, actorAccountId?: string) {
    const targetAccountId = dto.accountId ?? actorAccountId;
    if (!targetAccountId) {
      throw new BadRequestException({ code: 'missing_account_id', message: 'accountId mangler' });
    }

    const exists = await this.prisma.users.count({
      where: {
        account_id: targetAccountId,
        email: dto.email,
      },
    });
    if (exists > 0) {
      throw new BadRequestException({ code: 'duplicate_email', message: 'Email findes allerede' });
    }

    const hash = await bcrypt.hash(dto.password, 12);
    const standardRole = await this.ensureStandardRole();

    const user = await this.prisma.users.create({
      data: {
        id: randomUUID(),
        account_id: targetAccountId,
        email: dto.email,
        display_name: dto.displayName,
        password_hash: hash,
        status: 'active',
        user_roles: {
          create: [{ role_id: standardRole.id }],
        },
      },
      include: {
        accounts: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      accountId: user.account_id,
      status: user.status,
    };
  }

  async listUsers(accountId?: string) {
    return this.prisma.users.findMany({
      where: accountId ? { account_id: accountId } : undefined,
      orderBy: { created_at: 'asc' },
      include: {
        user_roles: {
          include: { roles: true },
        },
        profiles: true,
      },
    });
  }

  async setUserStatus(userId: string, status: 'active' | 'suspended') {
    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: { status },
    });

    return {
      id: updated.id,
      status: updated.status,
    };
  }
}
