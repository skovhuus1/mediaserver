import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppRole } from '../constants';
import { PUBLIC_ROUTE } from '../decorators/public.decorator';

interface JwtPayload {
  sub: string;
  accountId: string;
  profileId?: string | null;
  roles?: string[];
  deviceId?: string;
  ip?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers.authorization;
    const cookieToken = request.cookies?.bb_access_token;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.cookies?.bb_access_token;

    if (!token) {
      throw new UnauthorizedException({ code: 'missing_token', message: 'Mangler authorization-token' });
    }

    try {
      const payload = this.jwtService.verify(token) as JwtPayload;

      request.user = {
        sub: payload.sub,
        accountId: payload.accountId,
        profileId: payload.profileId ?? null,
        roles: payload.roles?.length ? payload.roles : [AppRole.STANDARD],
        deviceId: payload.deviceId ?? null,
        ip: request.ip,
      };

      return true;
    } catch {
      throw new UnauthorizedException({ code: 'invalid_token', message: 'Token ugyldig eller udløbet' });
    }
  }
}
