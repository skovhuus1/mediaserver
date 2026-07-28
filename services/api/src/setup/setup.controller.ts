import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth';
import { SetupRequestDto } from './setup.dto';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Public()
  @Get('status')
  status() {
    return this.setup.status();
  }

  @Public()
  @Post()
  @HttpCode(201)
  configure(@Body() dto: SetupRequestDto) {
    return this.setup.configure(dto);
  }
}
