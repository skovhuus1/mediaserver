import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { UpdaterService } from './updater.service';
import { DiagnosticsService } from './diagnostics.service';
import { BackupService } from './backup.service';
import { ServarrController } from './servarr.controller';
import { ServarrService } from './servarr.service';

@Module({
  controllers: [SystemController, ServarrController],
  providers: [UpdaterService, DiagnosticsService, BackupService, ServarrService],
})
export class SystemModule {}
