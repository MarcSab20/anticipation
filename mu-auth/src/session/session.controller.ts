// mu-auth/src/session/session.controller.ts
import { Controller, Post, Get, Delete, Req, Res, Body, Headers, HttpException, HttpStatus, Param, Logger } from '@nestjs/common';
import { Response } from 'express';
import { SessionService } from './session.service';

interface CreateSessionRequest {
  userId: string;
  fingerprint?: string;
  source?: 'auth' | 'dashboard' | 'api';
}

@Controller('session')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(private readonly sessionService: SessionService) {}

  /**
   * Créer une nouvelle session
   */
  @Post('create')
  async createSession(
    @Body() body: CreateSessionRequest,
    @Res() response: Response,
    @Headers('x-device-fingerprint') deviceFingerprint?: string
  ) {
    try {
      const { userId, fingerprint, source } = body;
      const finalFingerprint = fingerprint || deviceFingerprint || '';
      
      const { sessionData, cookie } = await this.sessionService.createSession(
        userId, 
        finalFingerprint, 
        source
      );

      const cookieOptions = this.sessionService.getCookieOptions();
      const cookieName = this.sessionService.getCookieName();
      
      response.cookie(cookieName, cookie, cookieOptions);
      
      return response.json({
        success: true,
        session: {
          sessionId: sessionData.sessionId,
          userId: sessionData.userId,
          email: sessionData.email,
          username: sessionData.username,
          roles: sessionData.roles,
          organizations: sessionData.organizations,
          expiresAt: new Date(Date.now() + cookieOptions.maxAge).toISOString()
        }
      });
      
    } catch (error) {
      this.logger.error('Session creation failed:', error);
      throw new HttpException({
        success: false,
        message: 'Failed to create session'
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Valider une session existante
   */
  @Get('validate')
  async validateSession(@Req() request: any) {
    try {
      const cookieName = this.sessionService.getCookieName();
      const cookieValue = request.cookies[cookieName];
      
      if (!cookieValue) {
        return {
          success: false,
          valid: false,
          message: 'No session cookie found'
        };
      }

      const sessionData = await this.sessionService.validateSession(cookieValue);
      
      if (!sessionData) {
        return {
          success: true,
          valid: false,
          message: 'Invalid or expired session'
        };
      }

      return {
        success: true,
        valid: true,
        session: {
          sessionId: sessionData.sessionId,
          userId: sessionData.userId,
          email: sessionData.email,
          username: sessionData.username,
          roles: sessionData.roles,
          organizations: sessionData.organizations,
          lastActivity: new Date(sessionData.lastActivity).toISOString(),
          source: sessionData.source
        }
      };
      
    } catch (error) {
      this.logger.error('Session validation failed:', error);
      return {
        success: false,
        valid: false,
        message: 'Session validation error'
      };
    }
  }

  /**
   * Rafraîchir une session
   */
  @Post('refresh')
  async refreshSession(@Req() request: any, @Res() response: Response) {
    try {
      const cookieName = this.sessionService.getCookieName();
      const cookieValue = request.cookies[cookieName];
      
      if (!cookieValue) {
        throw new HttpException('No session found', HttpStatus.BAD_REQUEST);
      }

      const sessionData = await this.sessionService.validateSession(cookieValue);
      
      if (!sessionData) {
        throw new HttpException('Invalid session', HttpStatus.UNAUTHORIZED);
      }

      const { sessionData: refreshedSession, cookie } = await this.sessionService.refreshSession(sessionData);
      
      const cookieOptions = this.sessionService.getCookieOptions();
      response.cookie(cookieName, cookie, cookieOptions);
      
      return response.json({
        success: true,
        session: {
          sessionId: refreshedSession.sessionId,
          lastActivity: new Date(refreshedSession.lastActivity).toISOString()
        }
      });
      
    } catch (error) {
      this.logger.error('Session refresh failed:', error);
      throw new HttpException({
        success: false,
        message: 'Failed to refresh session'
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Supprimer une session
   */
  @Delete('logout')
  async logout(@Req() request: any, @Res() response: Response) {
    try {
      const cookieName = this.sessionService.getCookieName();
      const cookieValue = request.cookies[cookieName];
      
      if (cookieValue) {
        const sessionData = await this.sessionService.validateSession(cookieValue);
        if (sessionData) {
          await this.sessionService.invalidateSession(sessionData.sessionId);
        }
      }

      // Supprimer le cookie
      response.clearCookie(cookieName, {
        domain: this.sessionService.getCookieOptions().domain,
        path: '/'
      });
      
      return response.json({
        success: true,
        message: 'Session terminated'
      });
      
    } catch (error) {
      this.logger.error('Logout failed:', error);
      throw new HttpException({
        success: false,
        message: 'Logout failed'
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Supprimer toutes les sessions d'un utilisateur
   */
  @Delete('logout-all/:userId')
  async logoutAll(@Param('userId') userId: string, @Res() response: Response) {
    try {
      await this.sessionService.invalidateAllUserSessions(userId);
      
      // Supprimer le cookie actuel
      const cookieName = this.sessionService.getCookieName();
      response.clearCookie(cookieName, {
        domain: this.sessionService.getCookieOptions().domain,
        path: '/'
      });
      
      return response.json({
        success: true,
        message: 'All sessions terminated'
      });
      
    } catch (error) {
      this.logger.error('Logout all failed:', error);
      throw new HttpException({
        success: false,
        message: 'Failed to logout all sessions'
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}