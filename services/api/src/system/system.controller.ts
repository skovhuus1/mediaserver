import { Controller, Get, Header, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';
import { Public, Roles } from '../common/auth';
import { UpdaterService } from './updater.service';
import { collectDefaultMetrics, register } from 'prom-client';

let metricsInitialized = false;
if (!metricsInitialized) {
  collectDefaultMetrics({ prefix: 'bb_media_' });
  metricsInitialized = true;
}

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly updater: UpdaterService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'boltbytes-media-api', version: '0.1.0', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready() {
    const [, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    return { status: redis === 'PONG' ? 'ready' : 'degraded', database: 'ready', redis };
  }

  @Get('metrics')
  @Roles('admin')
  @Header('content-type', register.contentType)
  metrics() {
    return register.metrics();
  }

  @Get('update/status')
  @Roles('admin')
  updateStatus() {
    return this.updater.status();
  }

  @Post('update/check')
  @Roles('admin')
  updateCheck() {
    return this.updater.status();
  }

  @Post('update/apply')
  @Roles('admin')
  updateApply() {
    return this.updater.apply();
  }
}
