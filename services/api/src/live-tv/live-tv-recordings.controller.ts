import { Body, Controller, Delete, Get, Head, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/auth';
import { CreateLiveTvRecordingDto } from './live-tv-recordings.dto';
import { LiveTvRecordingsService } from './live-tv-recordings.service';

@ApiTags('live-tv-recordings')
@Controller('live-tv/recordings')
export class LiveTvRecordingsController {
  constructor(private readonly recordings: LiveTvRecordingsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser) { return this.recordings.list(actor); }
  @Get('schedule-options') options(@CurrentUser() actor: AuthenticatedUser) { return this.recordings.scheduleOptions(actor); }
  @Post() create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLiveTvRecordingDto) { return this.recordings.create(actor, dto); }
  @Post(':id/cancel') cancel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.recordings.cancel(actor, id); }
  @Delete(':id') remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.recordings.remove(actor, id); }
  @Post(':id/playback') playback(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.recordings.authorizePlayback(actor, id); }
  @Get(':id/stream') @Public() stream(@Param('id') id: string, @Query('token') token: string | undefined, @Headers('range') range: string | undefined, @Res() response: Response) { return this.recordings.send(id, token, range, response); }
  @Head(':id/stream') @Public() head(@Param('id') id: string, @Query('token') token: string | undefined, @Headers('range') range: string | undefined, @Res() response: Response) { return this.recordings.send(id, token, range, response, true); }
}
