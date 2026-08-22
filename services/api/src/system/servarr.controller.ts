import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Public, Roles } from '../common/auth';
import { AddServarrItemDto, SaveServarrConnectionDto, ServarrLookupQueryDto, TestServarrConnectionDto } from './servarr.dto';
import { ServarrService } from './servarr.service';

@Controller('system/integrations/servarr')
export class ServarrController {
  constructor(private readonly servarr: ServarrService) {}
  @Get() @Roles('admin', 'operator') overview(@CurrentUser() actor: AuthenticatedUser) { return this.servarr.overview(actor); }
  @Put(':provider') @Roles('admin') save(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string, @Body() input: SaveServarrConnectionDto) { return this.servarr.save(actor, provider, input); }
  @Post(':provider/test') @Roles('admin') test(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string, @Body() input: TestServarrConnectionDto) { return this.servarr.test(actor, provider, input); }
  @Get(':provider/resources') @Roles('admin', 'operator') resources(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string) { return this.servarr.resources(actor, provider); }
  @Get(':provider/lookup') @Roles('admin') lookup(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string, @Query() query: ServarrLookupQueryDto) { return this.servarr.lookup(actor, provider, query.term); }
  @Post(':provider/items') @Roles('admin') add(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string, @Body() input: AddServarrItemDto) { return this.servarr.add(actor, provider, input); }
  @Post(':provider/webhook-secret') @Roles('admin') rotateWebhook(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string) { return this.servarr.rotateWebhookSecret(actor, provider); }
  @Delete(':provider') @Roles('admin') remove(@CurrentUser() actor: AuthenticatedUser, @Param('provider') provider: string) { return this.servarr.remove(actor, provider); }
  @Post('webhooks/:accountId/:provider') @Public() @HttpCode(202) webhook(@Param('accountId') accountId: string, @Param('provider') provider: string, @Headers('authorization') authorization: string | undefined, @Headers('x-boltbytes-webhook-secret') directSecret: string | undefined, @Body() body: unknown) { return this.servarr.webhook(accountId, provider, authorization, directSecret, body); }
}
