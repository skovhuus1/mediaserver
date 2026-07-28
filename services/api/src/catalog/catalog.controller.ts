import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { CatalogService } from './catalog.service';
import { BrowseLibraryDirectoriesDto, CreateLibraryDto, CreateMediaDto } from './catalog.dto';

@ApiTags('libraries')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('libraries')
  libraries(@CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.listLibraries(actor);
  }

  @Get('storage-roots')
  storageRoots(@CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.listStorageRoots(actor);
  }

  @Get('libraries/directories')
  @Roles('admin', 'operator')
  directories(@CurrentUser() actor: AuthenticatedUser, @Query() query: BrowseLibraryDirectoriesDto) {
    return this.catalog.browseDirectories(actor, query);
  }

  @Post('libraries')
  @Roles('admin', 'operator')
  createLibrary(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLibraryDto) {
    return this.catalog.createLibrary(actor, dto);
  }

  @Post('libraries/:id/scans')
  @Roles('admin', 'operator')
  scanLibrary(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.queueScan(actor, id);
  }

  @Get('libraries/:id/scans')
  scans(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.listScans(actor, id);
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
