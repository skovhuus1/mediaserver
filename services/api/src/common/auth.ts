import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@boltbytes/contracts';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_ROLES = 'requiredRoles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) throw new UnauthorizedException({ code: 'missing_auth_context', message: 'Authentication context is missing' });
  return request.user;
});

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'missing_token', message: 'Bearer token is required' });
    }
    try {
      request.user = await this.jwt.verifyAsync<AuthenticatedUser>(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'invalid_token', message: 'Bearer token is invalid or expired' });
    }
  }
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user || !required.some((role) => request.user?.roles.includes(role))) {
      throw new ForbiddenException({ code: 'role_required', message: 'Your role does not allow this action' });
    }
    return true;
  }
}

export function isPrivileged(user: AuthenticatedUser): boolean {
  return user.roles.includes('admin') || user.roles.includes('operator');
}
