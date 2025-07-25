import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session) {
      throw new UnauthorizedException('No valid session found');
    }

    // Vérifier les rôles si nécessaire
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles) {
      const hasRole = requiredRoles.some(role => session.roles?.includes(role));
      if (!hasRole) {
        throw new UnauthorizedException('Insufficient permissions');
      }
    }

    return true;
  }
}