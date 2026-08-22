import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { LiveTvMaintenanceService } from './live-tv-maintenance.service';
import { RunLiveTvMaintenanceDto, UpdateLiveTvAutomationDto } from './live-tv-operations.dto';

@ApiTags('live-tv-operations')
@Controller('live-tv/admin')
export class LiveTvOperationsController {
  constructor(private readonly maintenance: LiveTvMaintenanceService) {}

  @Get('operations')
  @Roles('admin', 'operator')
  state(@CurrentUser() actor: AuthenticatedUser) { return this.maintenance.state(actor); }

  @Patch('providers/:providerId/automation')
  @Roles('admin')
  updateAutomation(@CurrentUser() actor: AuthenticatedUser, @Param('providerId') providerId: string, @Body() dto: UpdateLiveTvAutomationDto) {
    return this.maintenance.updateAutomation(actor, providerId, dto);
  }

  @Post('providers/:providerId/run')
  @Roles('admin')
  run(@CurrentUser() actor: AuthenticatedUser, @Param('providerId') providerId: string, @Body() dto: RunLiveTvMaintenanceDto) {
    return this.maintenance.runNow(actor, providerId, dto);
  }

  @Delete('leases/:leaseId')
  @Roles('admin')
  terminate(@CurrentUser() actor: AuthenticatedUser, @Param('leaseId') leaseId: string) {
    return this.maintenance.terminateLease(actor, leaseId);
  }
}
