import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PlaybackController } from './playback.controller';
import { PlaybackDecisionService } from './playback-decision.service';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';

@Module({
  imports: [PrismaModule, EntitlementsModule],
  controllers: [PlaybackController],
  providers: [PlaybackService, PlaybackDecisionService, StreamReservationService],
})
export class PlaybackModule {}
