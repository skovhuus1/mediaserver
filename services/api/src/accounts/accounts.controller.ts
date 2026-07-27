import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppRole } from '../common/constants';
import { AccountsService } from './accounts.service';

class CreateAccountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  serverName?: string;

  @IsOptional()
  @IsString()
  externalUrl?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

@Controller('accounts')
@ApiTags('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('bootstrap-state')
  @HttpCode(200)
  async bootstrapState() {
    return this.accountsService.bootstrapState();
  }

  @Get()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async list(@CurrentUser() user: any) {
    return this.accountsService.listAccounts(user.accountId);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.OPERATOR)
  async create(@Body() dto: CreateAccountDto, @CurrentUser() user: any) {
    return this.accountsService.createAccount(dto, user.accountId);
  }
}
