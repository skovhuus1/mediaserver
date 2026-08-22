import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { UpdaterService } from './updater.service';
import { DiagnosticsService } from './diagnostics.service';
import { BackupService } from './backup.service';

@Module({
  controllers: [SystemController],
  providers: [UpdaterService, DiagnosticsService, BackupService],
})
export class SystemModule {}
