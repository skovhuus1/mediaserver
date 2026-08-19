import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/auth';
import { OfflineDownloadProgressDto, PrepareOfflineDownloadDto } from './offline-downloads.dto';
import { OfflineDownloadsService } from './offline-downloads.service';

@ApiTags('offline-downloads')
@Controller('offline-downloads')
export class OfflineDownloadsController {
  constructor(private readonly downloads: OfflineDownloadsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.downloads.list(actor);
  }

  @Post()
  prepare(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PrepareOfflineDownloadDto,
  ) {
    return this.downloads.prepare(actor, dto);
  }

  @Public()
  @Get(':id/file')
  file(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.downloads.send(id, token, range, response, false);
  }

  @Public()
  @Head(':id/file')
  head(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.downloads.send(id, token, range, response, true);
  }

  @Get(':id')
  status(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.downloads.status(actor, id);
  }

  @Post(':id/renew')
  renew(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.downloads.renew(actor, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.downloads.complete(actor, id);
  }

  @Patch(':id/progress')
  progress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OfflineDownloadProgressDto,
  ) {
    return this.downloads.progress(actor, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.downloads.remove(actor, id);
  }
}
