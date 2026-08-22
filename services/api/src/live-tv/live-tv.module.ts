import { Module } from '@nestjs/common';
import { LiveTvController } from './live-tv.controller';
import { LiveTvPlaybackService } from './live-tv-playback.service';
import { LiveTvService } from './live-tv.service';
import { LiveTvStreamController } from './live-tv-stream.controller';
import { LiveTvStreamService } from './live-tv-stream.service';

@Module({ controllers: [LiveTvController, LiveTvStreamController], providers: [LiveTvService, LiveTvPlaybackService, LiveTvStreamService] })
export class LiveTvModule {}
