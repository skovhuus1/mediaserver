import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { DevicesService } from './devices.service';

class RegisterDeviceDto {
  @IsString()
  deviceName!: string;

  @IsString()
  deviceType!: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;
}

@Controller('devices')
@ApiTags('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.devicesService.listDevices(user?.accountId, user?.sub);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async register(@Body() dto: RegisterDeviceDto, @CurrentUser() user: any) {
    return this.devicesService.registerDevice({
      accountId: user?.accountId,
      userId: user?.sub,
      input: dto,
    });
  }

  @Delete(':id')
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async revoke(@Param('id') id: string, @CurrentUser() user: any) {
    return this.devicesService.revokeDevice(user?.accountId, id);
  }
}
