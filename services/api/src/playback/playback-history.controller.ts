import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { PlaybackProgressDto, SetWatchedDto } from './playback-history.dto';
import { PlaybackHistoryService } from './playback-history.service';
import { WatchlistTargetDto } from './watchlist.dto';

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

  @Delete('history/:mediaId')
  removeFromContinueWatching(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
  ) {
    return this.history.removeFromContinueWatching(actor, mediaId);
  }

  @Get('watchlist')
  watchlist(@CurrentUser() actor: AuthenticatedUser) {
    return this.history.watchlist(actor);
  }

  @Put('watchlist/:mediaId')
  addToWatchlist(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
    @Body() input?: WatchlistTargetDto,
  ) {
    return this.history.addToWatchlist(actor, mediaId, input?.targetType);
  }

  @Delete('watchlist/:mediaId')
  removeFromWatchlist(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
  ) {
    return this.history.removeFromWatchlist(actor, mediaId);
  }

  @Get('history/:mediaId/status')
  mediaStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
  ) {
    return this.history.mediaStatus(actor, mediaId);
  }

  @Patch('history/:mediaId/watched')
  setWatched(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: SetWatchedDto,
  ) {
    return this.history.setWatched(actor, mediaId, dto.watched);
  }

  @Get('history/series-next')
  nextEpisode(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('seriesTitle') seriesTitle?: string,
    @Query('seriesDisplayTitle') seriesDisplayTitle?: string,
    @Query('seriesMetadataProviderId') seriesMetadataProviderId?: string,
    @Query('afterMediaId') afterMediaId?: string,
  ) {
    return this.history.nextEpisode(actor, {
      ...(seriesTitle ? { seriesTitle } : {}),
      ...(seriesDisplayTitle ? { seriesDisplayTitle } : {}),
      ...(seriesMetadataProviderId ? { seriesMetadataProviderId } : {}),
      ...(afterMediaId ? { afterMediaId } : {}),
    });
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
