import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { PlaybackProgressDto } from './playback-history.dto';
import { PlaybackHistoryService } from './playback-history.service';

@ApiTags('playback')
@Controller('playback')
export class PlaybackHistoryController {
  constructor(private readonly history: PlaybackHistoryService) {}

  @Get('context')
  context(@CurrentUser() actor: AuthenticatedUser) {
    return this.history.context(actor);
  }

  @Get('history/continue')
  continueWatching(@CurrentUser() actor: AuthenticatedUser) {
    return this.history.continueWatching(actor);
  }

  @Patch('sessions/:id/progress')
  updateProgress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') sessionId: string,
    @Body() dto: PlaybackProgressDto,
  ) {
    return this.history.updateProgress(actor, sessionId, dto);
  }
}
