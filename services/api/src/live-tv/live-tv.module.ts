import { Module } from '@nestjs/common';
import { LiveTvController } from './live-tv.controller';
import { LiveTvPlaybackService } from './live-tv-playback.service';
import { LiveTvService } from './live-tv.service';
import { LiveTvStreamController } from './live-tv-stream.controller';
import { LiveTvStreamService } from './live-tv-stream.service';
import { LiveTvMaintenanceService } from './live-tv-maintenance.service';
import { LiveTvOperationsController } from './live-tv-operations.controller';

@Module({ controllers: [LiveTvController, LiveTvStreamController, LiveTvOperationsController], providers: [LiveTvService, LiveTvPlaybackService, LiveTvStreamService, LiveTvMaintenanceService] })
export class LiveTvModule {}
