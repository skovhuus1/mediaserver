import { Body, Controller, Delete, Get, Head, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/auth';
import { DirectStreamService } from './direct-stream.service';
import { AuthorizePlaybackDto } from './playback.dto';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';
import { TranscodeStreamService } from './transcode-stream.service';

@ApiTags('playback')
@Controller('playback')
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly reservations: StreamReservationService,
    private readonly directStream: DirectStreamService,
    private readonly transcodeStream: TranscodeStreamService,
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

  @Post('sessions/:id/cast-handoff')
  castHandoff(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.playback.handoffToCast(actor, id);
  }

  @Get('sessions/:id/transcode-status')
  @Public()
  transcodeStatus(@Param('id') id: string, @Query('token') token: string | undefined) {
    return this.transcodeStream.status(id, token);
  }

  @Get('sessions/:id/hls/:asset')
  @Public()
  hlsAsset(
    @Param('id') id: string,
    @Param('asset') asset: string,
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ) {
    return this.transcodeStream.sendAsset(id, asset, token, response);
  }

  @Get('sessions/:id/stream')
  @Public()
  stream(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.directStream.send(id, token, range, response, false);
  }

  @Head('sessions/:id/stream')
  @Public()
  streamHead(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.directStream.send(id, token, range, response, true);
  }
}
