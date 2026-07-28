import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
  SuspendUserDto,
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

  @Post('entitlement-overrides')
  @Roles('admin')
  createOverride(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEntitlementOverrideDto) {
    return this.administration.createOverride(actor, dto);
  }
}
