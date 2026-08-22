import { Body, Controller, Delete, Get, Param, Patch, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth';
import { LiveTvHeartbeatDto } from './live-tv.dto';
import { LiveTvPlaybackService } from './live-tv-playback.service';
import { LiveTvStreamService, type LiveTvStreamResult } from './live-tv-stream.service';

@ApiTags('live-tv-stream')
@Public()
@Controller('live-tv/stream')
export class LiveTvStreamController {
  constructor(private readonly stream: LiveTvStreamService, private readonly playback: LiveTvPlaybackService) {}

  @Get(':id/direct') async direct(@Param('id') id: string, @Query('token') token: string | undefined, @Res() response: Response) { return send(response, await this.stream.direct(id, token)); }
  @Get(':id/proxy') async proxy(@Param('id') id: string, @Query('token') token: string | undefined, @Query('target') target: string | undefined, @Res() response: Response) { return send(response, await this.stream.proxy(id, token, target)); }
  @Get(':id/manifest') async manifest(@Param('id') id: string, @Query('token') token: string | undefined, @Res() response: Response) { return send(response, await this.stream.manifest(id, token)); }
  @Get(':id/hls/:file') async hls(@Param('id') id: string, @Param('file') file: string, @Query('token') token: string | undefined, @Res() response: Response) { return send(response, await this.stream.hlsFile(id, token, file)); }
  @Get(':id/status') status(@Param('id') id: string, @Query('token') token: string | undefined) { return this.playback.status(id, token); }
  @Patch(':id/heartbeat') heartbeat(@Param('id') id: string, @Query('token') token: string | undefined, @Body() dto: LiveTvHeartbeatDto) { return this.playback.heartbeat(id, token, dto); }
  @Delete(':id') release(@Param('id') id: string, @Query('token') token: string | undefined) { return this.playback.release(id, token); }
}

function send(response: Response, result: LiveTvStreamResult) {
  response.status(result.status);
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (Buffer.isBuffer(result.body)) return response.send(result.body);
  result.body.pipe(response);
}
