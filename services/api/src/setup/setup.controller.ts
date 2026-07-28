import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth';
import { BrowseDirectoriesDto, SetupRequestDto } from './setup.dto';
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
  @Get('directories')
  directories(@Query() query: BrowseDirectoriesDto) {
    return this.setup.browseDirectories(query.path);
  }

  @Public()
  @Post()
  @HttpCode(201)
  configure(@Body() dto: SetupRequestDto) {
    return this.setup.configure(dto);
  }
}
