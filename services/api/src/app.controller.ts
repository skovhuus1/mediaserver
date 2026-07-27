import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('system')
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'bb-media-api',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }
}
