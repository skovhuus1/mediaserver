import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser, Public } from '../common/auth';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() actor: AuthenticatedUser, @Body() dto: LogoutDto) {
    return this.auth.logout(actor, dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() actor: AuthenticatedUser) {
    return this.auth.me(actor);
  }
}
