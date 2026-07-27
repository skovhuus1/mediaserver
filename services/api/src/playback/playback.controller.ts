import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { AuthorizePlaybackDto } from './playback.dto';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';

@ApiTags('playback')
@Controller('playback')
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly reservations: StreamReservationService,
  ) {}

  @Post('authorize')
  authorize(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AuthorizePlaybackDto) {
    return this.playback.authorize(actor, dto);
  }

  @Get('sessions')
  sessions(@CurrentUser() actor: AuthenticatedUser) {
    return this.playback.list(actor);
  }

  @Patch('sessions/:id/heartbeat')
  heartbeat(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.heartbeat(actor, id);
  }

  @Delete('sessions/:id')
  stop(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.release(actor, id);
  }
}
