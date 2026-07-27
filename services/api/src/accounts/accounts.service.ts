import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAccountInput {
  name: string;
  serverName?: string;
  externalUrl?: string;
  language?: string;
  timezone?: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrapState() {
    const count = await this.prisma.accounts.count();
    return {
      hasAccount: count > 0,
      requiresBootstrap: count === 0,
    };
  }

  async listAccounts(actorAccountId?: string) {
    return this.prisma.accounts.findMany({
      where: actorAccountId ? { id: actorAccountId } : undefined,
      select: {
        id: true,
        name: true,
        status: true,
        language: true,
        timezone: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async createAccount(dto: CreateAccountInput, actorAccountId?: string) {
      // In phase 1 only allow actor without account for bootstrap path through system endpoint.
    if (actorAccountId) {
      const actor = await this.prisma.users.count({ where: { account_id: actorAccountId } });
      if (actor > 0) {
        throw new BadRequestException({ code: 'account_creation_locked', message: 'Konto kan kun oprettes gennem admin flow' });
      }
    }

    return this.prisma.accounts.create({
      data: {
        name: dto.name,
        server_name: dto.serverName ?? 'BoltBytes Media',
        external_url: dto.externalUrl,
        language: dto.language ?? 'en',
        timezone: dto.timezone ?? 'Europe/Copenhagen',
      },
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true,
      },
    });
  }
}
