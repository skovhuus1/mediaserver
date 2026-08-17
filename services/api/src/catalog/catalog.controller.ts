import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { CatalogService } from './catalog.service';
import { ApplyMetadataMatchDto, BrowseLibraryDirectoriesDto, CatalogQueryDto, CreateLibraryDto, CreateMediaDto, MediaDetailsQueryDto, MetadataMatchQueryDto, QueueMetadataDto, SetMetadataLockDto, UpdateLibraryDto } from './catalog.dto';

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

  @Patch('libraries/:id')
  @Roles('admin', 'operator')
  updateLibrary(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLibraryDto) {
    return this.catalog.updateLibrary(actor, id, dto);
  }

  @Delete('libraries/:id')
  @Roles('admin', 'operator')
  deleteLibrary(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.deleteLibrary(actor, id);
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

  @Get('media/catalog')
  mediaCatalog(@CurrentUser() actor: AuthenticatedUser, @Query() query: CatalogQueryDto) {
    return this.catalog.listCatalog(actor, query);
  }

  @Get('media/metadata/status')
  metadataStatus(@CurrentUser() actor: AuthenticatedUser) {
    return this.catalog.metadataStatus(actor);
  }

  @Get('media/:id/details')
  mediaDetailPage(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MediaDetailsQueryDto,
  ) {
    return this.catalog.getMediaDetails(actor, id, query.season);
  }

  @Post('media/metadata/jobs')
  @Roles('admin', 'operator')
  queueMetadata(@CurrentUser() actor: AuthenticatedUser, @Body() dto: QueueMetadataDto) {
    return this.catalog.queueMetadata(actor, dto);
  }

  @Post('media/:id/metadata/jobs')
  @Roles('admin')
  queueMediaMetadata(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.queueMediaMetadata(actor, id);
  }

  @Get('media/:id/metadata/matches')
  @Roles('admin')
  metadataMatches(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MetadataMatchQueryDto,
  ) {
    return this.catalog.searchMetadataMatches(actor, id, query.q);
  }

  @Post('media/:id/metadata/match')
  @Roles('admin')
  applyMetadataMatch(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApplyMetadataMatchDto,
  ) {
    return this.catalog.applyMetadataMatch(actor, id, dto);
  }

  @Patch('media/:id/metadata-lock')
  @Roles('admin')
  setMetadataLock(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetMetadataLockDto,
  ) {
    return this.catalog.setMetadataLock(actor, id, dto.locked);
  }

  @Get('media/:id')
  mediaDetails(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.getMedia(actor, id);
  }

  @Post('media')
  @Roles('admin', 'operator')
  createMedia(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateMediaDto) {
    return this.catalog.createMedia(actor, dto);
  }
}
