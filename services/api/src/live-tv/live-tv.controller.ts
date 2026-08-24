import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import {
  BulkUpdateLiveTvAllChannelsDto, BulkUpdateLiveTvChannelGroupDto, BulkUpdateLiveTvChannelsDto, CreateLiveTvConnectionDto, CreateLiveTvProviderDto,
  ListAdminLiveTvChannelsDto, ListLiveTvGuideDto, LiveTvAuthorizeDto, LiveTvGuideNeighborDto, LiveTvSwitchDto, LiveTvTokenDto, MergeLiveTvChannelDto,
  UpdateLiveTvChannelDto, UpdateLiveTvConnectionDto, UpdateLiveTvProviderDto, UpdateLiveTvSourceDto,
} from './live-tv.dto';
import { LiveTvPlaybackService } from './live-tv-playback.service';
import { LiveTvService } from './live-tv.service';

@ApiTags('live-tv')
@Controller('live-tv')
export class LiveTvController {
  constructor(private readonly liveTv: LiveTvService, private readonly playback: LiveTvPlaybackService) {}

  @Get('admin/providers') @Roles('admin', 'operator') providers(@CurrentUser() actor: AuthenticatedUser) { return this.liveTv.providers(actor); }
  @Post('admin/providers') @Roles('admin') createProvider(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLiveTvProviderDto) { return this.liveTv.createProvider(actor, dto); }
  @Patch('admin/providers/:id') @Roles('admin') updateProvider(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLiveTvProviderDto) { return this.liveTv.updateProvider(actor, id, dto); }
  @Delete('admin/providers/:id') @Roles('admin') disableProvider(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.liveTv.disableProvider(actor, id); }
  @Post('admin/providers/:id/connections') @Roles('admin') createConnection(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateLiveTvConnectionDto) { return this.liveTv.createConnection(actor, id, dto); }
  @Patch('admin/connections/:id') @Roles('admin') updateConnection(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLiveTvConnectionDto) { return this.liveTv.updateConnection(actor, id, dto); }
  @Delete('admin/connections/:id') @Roles('admin') disableConnection(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.liveTv.disableConnection(actor, id); }
  @Post('admin/providers/:id/import') @Roles('admin') queueImport(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.liveTv.queueImport(actor, id); }
  @Post('admin/providers/:id/epg') @Roles('admin') queueEpg(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.liveTv.queueEpg(actor, id); }
  @Get('admin/jobs') @Roles('admin', 'operator') jobs(@CurrentUser() actor: AuthenticatedUser) { return this.liveTv.jobs(actor); }
  @Delete('admin/jobs/:id') @Roles('admin') cancelJob(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.liveTv.cancelJob(actor, id); }
  @Get('admin/channels') @Roles('admin', 'operator') channels(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListAdminLiveTvChannelsDto) { return this.liveTv.adminChannels(actor, query); }
  @Patch('admin/channels/bulk') @Roles('admin') bulkUpdateChannels(@CurrentUser() actor: AuthenticatedUser, @Body() dto: BulkUpdateLiveTvChannelsDto) { return this.liveTv.bulkUpdateChannels(actor, dto); }
  @Patch('admin/channels/all/visibility') @Roles('admin') bulkUpdateAllChannels(@CurrentUser() actor: AuthenticatedUser, @Body() dto: BulkUpdateLiveTvAllChannelsDto) { return this.liveTv.bulkUpdateAllChannels(actor, dto); }
  @Patch('admin/channels/groups/visibility') @Roles('admin') bulkUpdateChannelGroup(@CurrentUser() actor: AuthenticatedUser, @Body() dto: BulkUpdateLiveTvChannelGroupDto) { return this.liveTv.bulkUpdateChannelGroup(actor, dto); }
  @Patch('admin/channels/:id') @Roles('admin') updateChannel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLiveTvChannelDto) { return this.liveTv.updateChannel(actor, id, dto); }
  @Post('admin/channels/:id/merge') @Roles('admin') mergeChannel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: MergeLiveTvChannelDto) { return this.liveTv.mergeChannels(actor, id, dto.sourceChannelId); }
  @Patch('admin/sources/:id') @Roles('admin') updateSource(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLiveTvSourceDto) { return this.liveTv.updateSource(actor, id, dto); }

  @Get('guide') guide(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListLiveTvGuideDto) { return this.liveTv.guide(actor, query); }
  @Get('guide/channels/:id/neighbor') guideNeighbor(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Query() query: LiveTvGuideNeighborDto) { return this.liveTv.guideNeighbor(actor, id, query.direction); }
  @Put('favorites/:channelId') favorite(@CurrentUser() actor: AuthenticatedUser, @Param('channelId') id: string) { return this.liveTv.setFavorite(actor, id, true); }
  @Delete('favorites/:channelId') unfavorite(@CurrentUser() actor: AuthenticatedUser, @Param('channelId') id: string) { return this.liveTv.setFavorite(actor, id, false); }
  @Post('playback/authorize') authorize(@CurrentUser() actor: AuthenticatedUser, @Body() dto: LiveTvAuthorizeDto) { return this.playback.authorize(actor, dto); }
  @Post('playback/leases/:id/switch') switchChannel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: LiveTvSwitchDto) { return this.playback.switchChannel(actor, id, dto.channelId, dto.streamToken, dto.preferredMethod); }
  @Post('playback/leases/:id/cast-handoff') castHandoff(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: LiveTvTokenDto) { return this.playback.castHandoff(actor, id, dto.streamToken); }
  @Delete('playback/leases/:id/cast-handoff') endCast(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: LiveTvTokenDto) { return this.playback.endCastHandoff(actor, id, dto.streamToken); }
}
