import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { LibrariesService } from './libraries.service';
import { IsString } from 'class-validator';

class CreateLibraryDto {
  @IsString()
  storageRootId!: string;

  @IsString()
  name!: string;

  @IsString()
  type!: 'movie' | 'series' | 'home_video';
}

@Controller('libraries')
@ApiTags('libraries')
export class LibrariesController {
  constructor(private readonly librariesService: LibrariesService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.librariesService.listLibraries(user?.accountId);
  }

  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  @Post()
  async create(@Body() dto: CreateLibraryDto, @CurrentUser() user: any) {
    return this.librariesService.createLibrary(dto, user?.accountId);
  }

  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  @Patch(':id/scan')
  async scan(@CurrentUser() user: any) {
    return this.librariesService.queueScan(user?.accountId);
  }
}
