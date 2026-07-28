import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [PlaybackController],
  providers: [PlaybackService, StreamReservationService],
})
export class PlaybackModule {}
