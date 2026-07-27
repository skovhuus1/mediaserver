import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { EvaluateEntitlementDto } from './entitlements.dto';
import { EntitlementsService } from './entitlements.service';

@ApiTags('entitlements')
@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Post('evaluate')
  evaluate(@CurrentUser() actor: AuthenticatedUser, @Body() dto: EvaluateEntitlementDto) {
    return this.entitlements.evaluate(actor, dto);
  }
}
