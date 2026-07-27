import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateProfileInput = {
  name: string;
  userId?: string;
  isChildProfile?: boolean;
};

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(dto: CreateProfileInput, accountId?: string) {
    if (!accountId) {
      throw new BadRequestException({ code: 'missing_account', message: 'accountId mangler' });
    }

    return this.prisma.profiles.create({
      data: {
        account_id: accountId,
        user_id: dto.userId,
        name: dto.name,
        is_child_profile: dto.isChildProfile ?? false,
      },
    });
  }

  async listProfiles(accountId?: string) {
    return this.prisma.profiles.findMany({
      where: accountId ? { account_id: accountId } : undefined,
      include: { playback_history: true },
      orderBy: { created_at: 'asc' },
    });
  }
}
