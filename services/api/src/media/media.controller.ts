import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { MediaService } from './media.service';

class CreateMediaDto {
  @IsString()
  @IsNotEmpty()
  libraryId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  mediaType!: 'movie' | 'episode';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  metadataReleaseDate?: string;

  @IsOptional()
  @IsString()
  availabilityDate?: string;
}

@Controller('media')
@ApiTags('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.mediaService.listMedia(user?.accountId);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async create(@Body() dto: CreateMediaDto, @CurrentUser() user: any) {
    return this.mediaService.createMedia(dto, user?.accountId);
  }
}
