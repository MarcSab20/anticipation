// mu-auth/src/auth/auth.controller.ts
import { Controller, Post, Body, Get, Headers, Logger, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EventLoggerService } from './services/event-logger.service';

/**
 * Contrôleur REST pour l'authentification
 * Simplifié grâce à l'utilisation de smp-auth-ts
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService, 
    private readonly eventLogger: EventLoggerService
  ) {}

  /**
   * Authentification utilisateur
   */
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    try {
      const result = await this.authService.login(body.username, body.password);
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in,
          scope: result.scope,
          sessionId: result.session_id
        }
      };
    } catch (error) {
      this.logger.error(`Login failed for user ${body.username}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Authentication failed',
          error: error.message 
        }, 
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Rafraîchissement de token
   */
  @Post('refresh')
  async refreshToken(@Body() body: { refresh_token: string }) {
    try {
      const result = await this.authService.refreshToken(body.refresh_token);
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in
        }
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Token refresh failed',
          error: error.message 
        }, 
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Déconnexion utilisateur
   */
  @Post('logout')
  async logout(@Headers('authorization') authHeader: string) {
    try {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException('Token required', HttpStatus.BAD_REQUEST);
      }

      const token = authHeader.substring(7);
      await this.authService.logout(token);
      
      return {
        success: true,
        message: 'Logout successful'
      };
    } catch (error) {
      this.logger.error('Logout failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Logout failed',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Validation de token
   */
  @Post('validate')
  async validateToken(@Body() body: { token: string }) {
    try {
      const result = await this.authService.validateToken(body.token);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Token validation failed:', error.message);
      return {
        success: false,
        data: { valid: false },
        error: error.message
      };
    }
  }

  /**
   * Validation enrichie de token
   */
  @Post('validate-enriched')
  async validateTokenEnriched(@Body() body: { token: string }) {
    try {
      const result = await this.authService.validateTokenEnriched(body.token);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Enriched token validation failed:', error.message);
      return {
        success: false,
        data: { valid: false },
        error: error.message
      };
    }
  }

  /**
   * Informations utilisateur
   */
  @Get('user/:userId')
  async getUserInfo(@Param('userId') userId: string) {
    try {
      const userInfo = await this.authService.getUserInfo(userId);
      
      if (!userInfo) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      
      return {
        success: true,
        data: userInfo
      };
    } catch (error) {
      this.logger.error(`Failed to get user info for ${userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get user info',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Rôles utilisateur
   */
  @Get('user/:userId/roles')
  async getUserRoles(@Param('userId') userId: string) {
    try {
      const roles = await this.authService.getUserRoles(userId);
      
      return {
        success: true,
        data: { roles }
      };
    } catch (error) {
      this.logger.error(`Failed to get user roles for ${userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get user roles',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Token administrateur
   */
  @Post('admin-token')
  async getAdminToken() {
    try {
      const result = await this.authService.getClientCredentialsToken();
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in
        }
      };
    } catch (error) {
      this.logger.error('Failed to get admin token:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get admin token',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Invalidation du cache utilisateur
   */
  @Post('invalidate-cache')
  async invalidateUserCache(@Body() body: { userId: string }) {
    try {
      await this.authService.invalidateUserCache(body.userId);
      
      return {
        success: true,
        message: 'User cache invalidated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to invalidate cache for user ${body.userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to invalidate user cache',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Vérification de permissions
   */
  @Post('check-permission')
  async checkPermission(
    @Headers('authorization') authHeader: string,
    @Body() body: { 
      resourceId: string; 
      resourceType: string; 
      action: string; 
      context?: Record<string, any> 
    }
  ) {
    try {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException('Token required', HttpStatus.BAD_REQUEST);
      }

      const token = authHeader.substring(7);
      const allowed = await this.authService.checkPermission(
        token, 
        body.resourceId, 
        body.resourceType, 
        body.action, 
        body.context
      );
      
      return {
        success: true,
        data: { allowed }
      };
    } catch (error) {
      this.logger.error('Permission check failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Permission check failed',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Health check
   */
  @Get('health')
  async healthCheck() {
    try {
      const [keycloakTest, redisTest, opaTest] = await Promise.allSettled([
        this.authService.testKeycloakConnection(),
        this.authService.testRedisConnection(),
        this.authService.testOPAConnection()
      ]);

      const keycloak = keycloakTest.status === 'fulfilled' && keycloakTest.value.connected;
      const redis = redisTest.status === 'fulfilled' && redisTest.value.connected;
      const opa = opaTest.status === 'fulfilled' && opaTest.value.connected;
      
      const allHealthy = keycloak && redis && opa;

      return {
        success: true,
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          keycloak: {
            status: keycloak ? 'up' : 'down',
            details: keycloakTest.status === 'fulfilled' ? keycloakTest.value : undefined
          },
          redis: {
            status: redis ? 'up' : 'down',
            details: redisTest.status === 'fulfilled' ? redisTest.value : undefined
          },
          opa: {
            status: opa ? 'up' : 'down',
            details: opaTest.status === 'fulfilled' ? opaTest.value : undefined
          }
        },
        metrics: this.authService.getMetrics()
      };
    } catch (error) {
      this.logger.error('Health check failed:', error.message);
      return {
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Métriques du service
   */
  @Get('metrics')
  async getMetrics() {
    try {
      const metrics = this.authService.getMetrics();
      
      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to get metrics:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get metrics',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Événements récents
   */
  @Get('events/recent')
  async getRecentEvents(@Query('limit') limit?: string) {
    try {
      const events = await this.eventLogger.getRecentEvents(
        limit ? parseInt(limit) : 50
      );
      
      return {
        success: true,
        data: events,
        count: events.length
      };
    } catch (error) {
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

