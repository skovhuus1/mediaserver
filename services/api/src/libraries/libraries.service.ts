import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateLibraryInput = {
  storageRootId: string;
  name: string;
  type: 'movie' | 'series' | 'home_video';
};

@Injectable()
export class LibrariesService {
  constructor(private readonly prisma: PrismaService) {}

  async listLibraries(accountId?: string) {
    return this.prisma.libraries.findMany({
      where: accountId ? { account_id: accountId } : undefined,
      include: { storage_roots: true, library_paths: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async createLibrary(input: CreateLibraryInput, accountId?: string) {
    if (!accountId) {
      throw new BadRequestException({ code: 'missing_account_id', message: 'accountId mangler' });
    }
    return this.prisma.libraries.create({
      data: {
        account_id: accountId,
        storage_root_id: input.storageRootId,
        name: input.name,
        type: input.type,
      },
    });
  }

  async queueScan(accountId?: string) {
    if (!accountId) {
      return { queued: false, reason: 'missing_account_id' };
    }

    return { queued: true, accountId, queue: 'scan_enqueued', timestamp: new Date().toISOString() };
  }
}
