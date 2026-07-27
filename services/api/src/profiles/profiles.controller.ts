import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';

class CreateProfileDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  isChildProfile = false;
}

@Controller('profiles')
@ApiTags('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.profilesService.listProfiles(user?.accountId);
  }

  @Post()
  async create(@Body() dto: CreateProfileDto, @CurrentUser() user: any) {
    return this.profilesService.createProfile(dto, user?.accountId);
  }
}
