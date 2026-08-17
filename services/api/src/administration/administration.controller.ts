import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import {
  CreateEntitlementOverrideDto,
  CreatePlanDto,
  CreatePlanVersionDto,
  CreateProfileDto,
  CreateSubscriptionDto,
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  ArchiveProfileDto,
  ChangeSubscriptionPlanDto,
  SuspendUserDto,
  PlaybackAnalysisQueryDto,
  UpdatePlaybackMarkersDto,
} from './administration.dto';
import { AdministrationService } from './administration.service';

@ApiTags('administration')
@Controller()
export class AdministrationController {
  constructor(private readonly administration: AdministrationService) {}

  @Get('users')
  @Roles('admin', 'operator')
  users(@CurrentUser() actor: AuthenticatedUser) { return this.administration.listUsers(actor); }

  @Post('users')
  @Roles('admin')
  createUser(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.administration.createUser(actor, dto);
  }

  @Patch('users/:id')
  @Roles('admin')
  updateUser(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.administration.updateUser(actor, id, dto);
  }

  @Post('users/:id/reset-password')
  @Roles('admin')
  resetPassword(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.administration.resetPassword(actor, id);
  }

  @Patch('users/:id/suspend')
  @Roles('admin')
  suspendUser(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.administration.suspendUser(actor, id, dto.suspended);
  }

  @Get('profiles')
  profiles(@CurrentUser() actor: AuthenticatedUser) { return this.administration.listProfiles(actor); }

  @Post('profiles')
  createProfile(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProfileDto) {
    return this.administration.createProfile(actor, dto);
  }

  @Patch('profiles/:id')
  @Roles('admin')
  updateProfile(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.administration.updateProfile(actor, id, dto);
  }

  @Patch('profiles/:id/archive')
  @Roles('admin')
  archiveProfile(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() dto: ArchiveProfileDto) {
    return this.administration.archiveProfile(actor, id, dto.archived);
  }

  @Get('devices')
  devices(@CurrentUser() actor: AuthenticatedUser) { return this.administration.listDevices(actor); }

  @Delete('devices/:id')
  revokeDevice(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.administration.revokeDevice(actor, id);
  }

  @Get('plans')
  @Roles('admin', 'operator')
  plans(@CurrentUser() actor: AuthenticatedUser) { return this.administration.listPlans(actor); }

  @Post('plans')
  @Roles('admin')
  createPlan(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreatePlanDto) {
    return this.administration.createPlan(actor, dto);
  }

  @Post('plan-versions')
  @Roles('admin')
  createPlanVersion(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreatePlanVersionDto) {
    return this.administration.createPlanVersion(actor, dto);
  }

  @Get('subscriptions')
  @Roles('admin', 'operator')
  subscriptions(@CurrentUser() actor: AuthenticatedUser) { return this.administration.listSubscriptions(actor); }

  @Post('subscriptions')
  @Roles('admin')
  createSubscription(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSubscriptionDto) {
    return this.administration.createSubscription(actor, dto);
  }

  @Patch('subscriptions/:id/cancel')
  @Roles('admin')
  cancelSubscription(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.administration.cancelSubscription(actor, id);
  }

  @Patch('subscriptions/:id/change-plan')
  @Roles('admin')
  changeSubscriptionPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeSubscriptionPlanDto,
  ) {
    return this.administration.changeSubscriptionPlan(actor, id, dto.planVersionId);
  }

  @Get('entitlement-overrides')
  @Roles('admin', 'operator')
  overrides(@CurrentUser() actor: AuthenticatedUser) {
    return this.administration.listOverrides(actor);
  }

  @Post('entitlement-overrides')
  @Roles('admin')
  createOverride(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEntitlementOverrideDto) {
    return this.administration.createOverride(actor, dto);
  }

  @Delete('entitlement-overrides/:id')
  @Roles('admin')
  deleteOverride(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.administration.deleteOverride(actor, id);
  }

  @Get('playback-analysis')
  @Roles('admin', 'operator')
  playbackAnalysis(@CurrentUser() actor: AuthenticatedUser, @Query() query: PlaybackAnalysisQueryDto) {
    return this.administration.listPlaybackAnalysis(actor, query);
  }

  @Get('playback-analysis/:mediaId')
  @Roles('admin', 'operator')
  playbackAnalysisDetail(@CurrentUser() actor: AuthenticatedUser, @Param('mediaId') mediaId: string) {
    return this.administration.playbackAnalysisDetail(actor, mediaId);
  }

  @Post('playback-analysis/:mediaId/rebuild')
  @Roles('admin')
  rebuildPlaybackAnalysis(@CurrentUser() actor: AuthenticatedUser, @Param('mediaId') mediaId: string) {
    return this.administration.queuePlaybackAnalysis(actor, mediaId);
  }

  @Put('playback-analysis/:mediaId/markers')
  @Roles('admin')
  updatePlaybackMarkers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdatePlaybackMarkersDto,
  ) {
    return this.administration.updatePlaybackMarkers(actor, mediaId, dto);
  }

  @Delete('playback-analysis/:mediaId/markers')
  @Roles('admin')
  resetPlaybackMarkers(@CurrentUser() actor: AuthenticatedUser, @Param('mediaId') mediaId: string) {
    return this.administration.resetPlaybackMarkers(actor, mediaId);
  }
}
