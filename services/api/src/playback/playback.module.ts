import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';
import { DirectStreamService } from './direct-stream.service';
import { PlaybackHistoryController } from './playback-history.controller';
import { PlaybackHistoryService } from './playback-history.service';
import { TranscodeStreamService } from './transcode-stream.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [PlaybackController, PlaybackHistoryController],
  providers: [PlaybackService, PlaybackHistoryService, StreamReservationService, DirectStreamService, TranscodeStreamService],
})
export class PlaybackModule {}
