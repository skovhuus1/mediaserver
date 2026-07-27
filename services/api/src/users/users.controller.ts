import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  displayName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  accountId?: string;
}

class SuspendUserDto {
  @IsBoolean()
  suspended!: boolean;
}

@Controller('users')
@ApiTags('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async list(@CurrentUser() user: any) {
    return this.usersService.listUsers(user?.accountId);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.createUser(dto, user?.accountId);
  }

  @Patch(':id/suspend')
  @Roles(AppRole.ADMIN)
  async suspend(@Param('id') id: string, @Body() body: SuspendUserDto) {
    return this.usersService.setUserStatus(id, body.suspended ? 'suspended' : 'active');
  }
}
