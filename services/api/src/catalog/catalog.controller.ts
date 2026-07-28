import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { CatalogService } from './catalog.service';
import { CreateLibraryDto, CreateMediaDto } from './catalog.dto';

@ApiTags('libraries')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('libraries')
  libraries(@CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.listLibraries(actor);
  }

  @Post('libraries')
  @Roles('admin', 'operator')
  createLibrary(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLibraryDto) {
    return this.catalog.createLibrary(actor, dto);
  }

  @Get('media')
  media(@CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.listMedia(actor);
  }

  @Post('media')
  @Roles('admin', 'operator')
  createMedia(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateMediaDto) {
    return this.catalog.createMedia(actor, dto);
  }
}
