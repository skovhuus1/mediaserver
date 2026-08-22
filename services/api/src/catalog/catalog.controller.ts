import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Query, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { CatalogService } from './catalog.service';
import { ApplyMetadataMatchDto, BrowseLibraryDirectoriesDto, CatalogQueryDto, CreateLibraryDto, CreateMediaDto, MediaDetailsQueryDto, MetadataEpisodeOrdersQueryDto, MetadataMatchQueryDto, MetadataOverrideDto, QueueMetadataDto, QueuePlaybackAssetsBatchDto, SetMetadataLockDto, UpdateLibraryDto, UpdateTimelineMarkersDto } from './catalog.dto';

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

  @Get('media/:id/playback-assets')
  playbackAssets(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.getPlaybackAssets(actor, id);
  }

  @Post('media/:id/playback-assets/jobs')
  @Roles('admin')
  rebuildPlaybackAssets(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.queuePlaybackAssets(actor, id, true);
  }

  @Post('media/playback-assets/jobs')
  @Roles('admin')
  rebuildPlaybackAssetsBatch(@CurrentUser() actor: AuthenticatedUser, @Body() dto: QueuePlaybackAssetsBatchDto) {
    return this.catalog.queuePlaybackAssetsBatch(actor, dto);
  }

  @Put('media/:id/timeline-markers')
  @Roles('admin')
  updateTimelineMarkers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTimelineMarkersDto,
  ) {
    return this.catalog.updateTimelineMarkers(actor, id, dto);
  }

  @Get('media/:id/trickplay/:sheet')
  @Header('Content-Type', 'image/jpeg')
  async trickplaySheet(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('sheet', ParseIntPipe) sheet: number,
  ) {
    return new StreamableFile(await this.catalog.readTrickplaySheet(actor, id, sheet));
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

  @Get('media/:id/metadata/episode-orders')
  @Roles('admin')
  metadataEpisodeOrders(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: MetadataEpisodeOrdersQueryDto,
  ) {
    return this.catalog.listMetadataEpisodeOrders(actor, id, query.providerId);
  }

  @Get('media/:id/metadata/overrides')
  @Roles('admin')
  metadataOverrides(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.catalog.getMetadataOverrides(actor, id);
  }

  @Put('media/:id/metadata/overrides/:scope')
  @Roles('admin')
  saveMetadataOverride(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('scope') scope: string,
    @Body() dto: MetadataOverrideDto,
  ) {
    return this.catalog.saveMetadataOverride(actor, id, scope, dto);
  }

  @Delete('media/:id/metadata/overrides/:scope')
  @Roles('admin')
  deleteMetadataOverride(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('scope') scope: string,
  ) {
    return this.catalog.deleteMetadataOverride(actor, id, scope);
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
