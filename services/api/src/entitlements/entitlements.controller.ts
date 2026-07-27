import { BadRequestException, Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EvaluateEntitlementDto } from './dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { EntitlementsService } from './entitlements.service';

@Controller('entitlements')
@ApiTags('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateEntitlementDto, @CurrentUser() user: any) {
    if (!user?.sub && dto.profileId) {
      throw new UnauthorizedException({ code: 'missing_user_context', message: 'Mangler bruger i kontekst' });
    }

    return this.entitlementsService.evaluateForProfile(
      dto.profileId,
      dto.mediaId,
      {
        deviceId: dto.deviceContext?.deviceId ?? 'unknown',
        type: dto.deviceContext?.type ?? 'web',
        platform: dto.deviceContext?.platform,
        appVersion: dto.deviceContext?.appVersion,
        supportsCodec: dto.deviceContext?.supportsCodec,
      },
      dto.action,
    );
  }

  @Roles(AppRole.ADMIN)
  @Get('snapshot')
  async snapshot() {
    return {
      action: 'snapshot',
      generatedAt: new Date().toISOString(),
      revision: '0.1.0',
    };
  }
}
