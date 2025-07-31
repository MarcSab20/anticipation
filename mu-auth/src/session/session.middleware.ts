import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.cookies) {
        this.logger.debug('No cookies found in request, skipping session middleware');
        return next();
      }

      if (req.cookies.smp_session) {
        this.logger.debug('Session cookie found:', req.cookies.smp_session);
      } else {
        this.logger.debug('No smp_session cookie found');
      }

      next();
    } catch (error) {
      this.logger.error('Session middleware error:');
      this.logger.error(error);
      next();
    }
  }
}