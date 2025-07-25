import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from './session.service';

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionMiddleware.name);

  constructor(private readonly sessionService: SessionService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const cookieName = this.sessionService.getCookieName();
      const cookieValue = req.cookies[cookieName];

      if (cookieValue) {
        const sessionData = await this.sessionService.validateSession(cookieValue);
        
        if (sessionData) {
          // Ajouter les données de session à la requête
          (req as any).session = sessionData;
          (req as any).user = {
            userId: sessionData.userId,
            email: sessionData.email,
            username: sessionData.username,
            roles: sessionData.roles,
            organizations: sessionData.organizations
          };
          
          this.logger.debug(`Session found for user ${sessionData.userId}`);
        }
      }
      
      next();
    } catch (error) {
      this.logger.error('Session middleware error:', error);
      next(); // Continuer même en cas d'erreur
    }
  }
}