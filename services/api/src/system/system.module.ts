import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { UpdaterService } from './updater.service';

@Module({
  controllers: [SystemController],
  providers: [UpdaterService],
})
export class SystemModule {}
