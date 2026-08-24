import { Controller, Get, Header, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Roles } from '../common/auth';
import { DiagnosticsService } from './diagnostics.service';
import { OperationalTelemetryService } from './operational-telemetry.service';

@Controller('system')
export class OperationalTelemetryController {
  constructor(private readonly telemetry: OperationalTelemetryService, private readonly diagnostics: DiagnosticsService) {}

  @Get('telemetry') @Roles('admin', 'operator')
  history(@CurrentUser() actor: AuthenticatedUser, @Query('range') range?: string) { return this.telemetry.history(actor.accountId, range); }

  @Get('alerts') @Roles('admin', 'operator')
  alerts(@CurrentUser() actor: AuthenticatedUser) { return this.telemetry.alerts(actor.accountId); }

  @Patch('alerts/:id/acknowledge') @Roles('admin')
  acknowledge(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.telemetry.acknowledge(actor.accountId, actor.sub, id); }

  @Get('diagnostics/export') @Roles('admin', 'operator') @Header('Cache-Control', 'no-store')
  async exportDiagnostics(@CurrentUser() actor: AuthenticatedUser, @Res() response: Response) {
    const [diagnostics, telemetry, alerts] = await Promise.all([
      this.diagnostics.snapshot(actor.accountId), this.telemetry.history(actor.accountId, '24h'), this.telemetry.alerts(actor.accountId),
    ]);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="boltbytes-diagnostics-${new Date().toISOString().slice(0, 10)}.json"`);
    response.send(JSON.stringify({ generatedAt: new Date().toISOString(), diagnostics, telemetry, alerts }, null, 2));
  }
}
