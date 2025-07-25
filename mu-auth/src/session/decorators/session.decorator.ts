import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface SessionData {
  userId: string;
  email: string;
  username: string;
  roles: string[];
  organizations: string[];
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  fingerprint: string;
  source: 'auth' | 'dashboard' | 'api';
}

export const Session = createParamDecorator(
  (data: keyof SessionData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;

    if (!session) {
      return null;
    }

    return data ? session[data] : session;
  },
);

export const SessionUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);