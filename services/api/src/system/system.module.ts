import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { UpdaterService } from './updater.service';
import { DiagnosticsService } from './diagnostics.service';
import { BackupService } from './backup.service';
import { ServarrController } from './servarr.controller';
import { ServarrService } from './servarr.service';
import { OperationalTelemetryController } from './operational-telemetry.controller';
import { OperationalTelemetryService } from './operational-telemetry.service';

@Module({
  controllers: [SystemController, ServarrController, OperationalTelemetryController],
  providers: [UpdaterService, DiagnosticsService, BackupService, ServarrService, OperationalTelemetryService],
})
export class SystemModule {}
