import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import {
  RegisterPushDto,
  ReportClientCrashDto,
  TestNotificationDto,
} from './client-services.dto';
import { ClientServicesService } from './client-services.service';

@Controller('client-services')
export class ClientServicesController {
  constructor(private readonly services: ClientServicesService) {}

  @Post('push/register')
  registerPush(@CurrentUser() actor: AuthenticatedUser, @Body() dto: RegisterPushDto) {
    return this.services.registerPush(actor, dto);
  }

  @Delete('push/register')
  unregisterPush(@CurrentUser() actor: AuthenticatedUser) {
    return this.services.unregisterPush(actor);
  }

  @Get('notifications')
  notifications(@CurrentUser() actor: AuthenticatedUser) {
    return this.services.notifications(actor);
  }

  @Post('notifications/read-all')
  readAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.services.readAll(actor);
  }

  @Post('notifications/test')
  testNotification(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: TestNotificationDto,
  ) {
    return this.services.testNotification(actor, dto);
  }

  @Post('notifications/:id/read')
  readNotification(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.services.readNotification(actor, id);
  }

  @Post('crashes')
  reportCrash(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ReportClientCrashDto,
  ) {
    return this.services.reportCrash(actor, dto);
  }

  @Get('crashes')
  @Roles('admin', 'operator')
  crashes(@CurrentUser() actor: AuthenticatedUser) {
    return this.services.crashes(actor);
  }
}
