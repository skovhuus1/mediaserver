import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateMediaInput = {
  libraryId: string;
  title: string;
  mediaType: 'movie' | 'episode';
  description?: string;
  metadataReleaseDate?: string;
  availabilityDate?: string;
};

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async listMedia(accountId?: string) {
    return this.prisma.media_items.findMany({
      where: accountId ? { account_id: accountId } : undefined,
      orderBy: { created_at: 'desc' },
    });
  }

  async createMedia(dto: CreateMediaInput, accountId?: string) {
    if (!accountId) {
      throw new BadRequestException({ code: 'missing_account', message: 'accountId mangler' });
    }

    return this.prisma.media_items.create({
      data: {
        account_id: accountId,
        library_id: dto.libraryId,
        title: dto.title,
        media_type: dto.mediaType,
        description: dto.description,
        availability_override: dto.availabilityDate ? new Date(dto.availabilityDate) : null,
        metadata_release_date: dto.metadataReleaseDate ? new Date(dto.metadataReleaseDate) : null,
        digital_release_date: new Date(),
      },
    });
  }
}
