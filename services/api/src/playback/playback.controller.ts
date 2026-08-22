import { Body, Controller, Delete, Get, Head, Headers, Options, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/auth';
import { DirectStreamService } from './direct-stream.service';
import { applyMediaCors } from './media-cors';
import { AuthorizePlaybackDto, CastHandoffDto, PlaybackHeartbeatDto, ReconfigurePlaybackDto } from './playback.dto';
import { PlaybackService } from './playback.service';
import { StreamReservationService } from './stream-reservation.service';
import { SubtitleStreamService } from './subtitle-stream.service';
import { TranscodeStreamService } from './transcode-stream.service';

@ApiTags('playback')
@Controller('playback')
export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly reservations: StreamReservationService,
    private readonly directStream: DirectStreamService,
    private readonly transcodeStream: TranscodeStreamService,
    private readonly subtitleStream: SubtitleStreamService,
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
  heartbeat(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PlaybackHeartbeatDto,
  ) {
    return this.reservations.heartbeat(actor, id, dto);
  }

  @Patch('sessions/:id/cast-heartbeat')
  @Public()
  castHeartbeat(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body() dto: PlaybackHeartbeatDto,
  ) {
    return this.reservations.heartbeatWithToken(id, token, dto);
  }

  @Delete('sessions/:id/cast-heartbeat')
  @Public()
  releaseCast(@Param('id') id: string, @Query('token') token: string | undefined) {
    return this.reservations.releaseWithToken(id, token, 'cast_receiver_stopped');
  }

  @Delete('sessions/:id')
  stop(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.release(actor, id);
  }

  @Patch('sessions/:id/configuration')
  reconfigure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReconfigurePlaybackDto,
  ) {
    return this.playback.reconfigure(actor, id, dto);
  }

  @Post('sessions/:id/cast-handoff')
  castHandoff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CastHandoffDto,
    @Headers('origin') origin: string | undefined,
  ) {
    return this.playback.handoffToCast(actor, id, dto, origin);
  }

  @Delete('sessions/:id/cast-handoff')
  cancelCastHandoff(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.playback.cancelCastHandoff(actor, id);
  }

  @Get('sessions/:id/transcode-status')
  @Public()
  transcodeStatus(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('generation') generation: string | undefined,
  ) {
    return this.transcodeStream.status(id, token, generation);
  }

  @Get('sessions/:id/subtitle-status')
  @Public()
  subtitleStatus(@Param('id') id: string, @Query('token') token: string | undefined) {
    return this.subtitleStream.status(id, token);
  }

  @Get('sessions/:id/hls/:asset')
  @Public()
  hlsAsset(
    @Param('id') id: string,
    @Param('asset') asset: string,
    @Query('token') token: string | undefined,
    @Query('generation') generation: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res() response: Response,
  ) {
    return this.transcodeStream.sendAsset(id, asset, token, generation, origin, response);
  }

  @Get('sessions/:id/subtitles/:asset')
  @Public()
  subtitleAsset(
    @Param('id') id: string,
    @Param('asset') asset: string,
    @Query('token') token: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res() response: Response,
  ) {
    return this.subtitleStream.send(id, asset, token, origin, response);
  }

  @Get('sessions/:id/stream')
  @Public()
  stream(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res() response: Response,
  ) {
    return this.directStream.send(id, token, range, origin, response, false);
  }

  @Head('sessions/:id/stream')
  @Public()
  streamHead(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Res() response: Response,
  ) {
    return this.directStream.send(id, token, range, origin, response, true);
  }

  @Options(['sessions/:id/stream', 'sessions/:id/hls/:asset', 'sessions/:id/subtitles/:asset', 'sessions/:id/cast-heartbeat'])
  @Public()
  mediaPreflight(@Headers('origin') origin: string | undefined, @Res() response: Response) {
    applyMediaCors(response, origin);
    response.status(204).end();
  }
}
