import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EntitlementAction } from '@bb-media/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaybackService } from './playback.service';

class PlaybackAuthorizeDto {
  profileId!: string;
  mediaId!: string;
  deviceId!: string;
  deviceType!: string;
  isCastSession = false;
  appVersion?: string;
  deviceContext?: {
    supportsCodecs?: string[];
  };
  requestedAction?: EntitlementAction;
}

@Controller('playback')
@ApiTags('playback')
export class PlaybackController {
  constructor(private readonly playbackService: PlaybackService) {}

  @Post('authorize')
  async authorize(@Body() dto: PlaybackAuthorizeDto, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException({ code: 'missing_user', message: 'Mangler bruger i kontekst' });
    }

    return this.playbackService.authorize(
      user,
      {
        profileId: dto.profileId,
        mediaId: dto.mediaId,
        deviceId: dto.deviceId,
        deviceType: dto.deviceType,
        requestedAction: dto.requestedAction,
        appVersion: dto.appVersion,
        playbackContext: {
          deviceId: dto.deviceId,
          type: dto.deviceType,
          supportsCodecs: dto.deviceContext?.supportsCodecs,
        },
        isCastSession: dto.isCastSession,
      },
    );
  }

  @Get('sessions')
  async list(@CurrentUser() user: any) {
    return this.playbackService.listSessions(user?.accountId);
  }

  @Patch('sessions/:id/heartbeat')
  async heartbeat(@Param('id') id: string, @Body() body: { leaseSeconds?: number }) {
    return this.playbackService.refreshHeartbeat(id, body?.leaseSeconds ?? 60);
  }

  @Delete('sessions/:id')
  async stop(@Param('id') id: string) {
    return this.playbackService.releaseSession(id, 'user_stopped');
  }
}
