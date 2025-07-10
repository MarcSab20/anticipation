import { 
  Post, 
  Get,
  Delete,
  Body, 
  Param,
  Query,
  Headers,
  Req,
  Logger, 
  HttpException, 
  HttpStatus, 
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { MagicLinkIntegrationService } from '../services/magic-link-integration.service';
import { 
  MagicLinkGenerationInputDto, 
  MagicLinkVerificationInputDto,
  MagicLinkGenerationResponseDto,
  MagicLinkVerificationResponseDto
} from '../dto/magic-link-mu.dto';

/**
 * Extension pour ajouter les endpoints Magic Link à l'AuthController existant
 * 
 * Pour intégrer dans le AuthController existant, ajoutez ces méthodes :
 */

export class AuthControllerMagicLinkExtension {
  private readonly logger = new Logger('AuthController');

  constructor(
    private readonly magicLinkService: MagicLinkIntegrationService
  ) {}

  /**
   * Générer un Magic Link
   */
  @Post('magic-link/generate')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async generateMagicLink(
    @Body() body: MagicLinkGenerationInputDto,
    @Req() req?: any
  ): Promise<{
    success: boolean;
    data?: MagicLinkGenerationResponseDto;
    message?: string;
  }> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Magic Link service is disabled'
        };
      }

      this.logger.log(`🔗 Generating magic link for: ${body.email}`);

      // Extraire le contexte depuis la requête si disponible
      const context = {
        ip: body.ip || req?.ip || req?.connection?.remoteAddress,
        userAgent: body.userAgent || req?.get('User-Agent'),
        deviceFingerprint: body.deviceFingerprint,
        referrer: body.referrer || req?.get('Referer')
      };

      const result = await this.magicLinkService.generateMagicLink({
        email: body.email,
        action: body.action || 'login',
        redirectUrl: body.redirectUrl,
        context
      });

      if (result.success) {
        return {
          success: true,
          data: {
            success: result.success,
            linkId: result.linkId,
            message: result.message,
            expiresAt: result.expiresAt,
            emailSent: result.emailSent
          }
        };
      } else {
        return {
          success: false,
          message: result.message
        };
      }

    } catch (error) {
      this.logger.error(`❌ Failed to generate magic link for ${body.email}:`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to generate magic link',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Vérifier un Magic Link
   */
  @Post('magic-link/verify')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async verifyMagicLink(
    @Body() body: MagicLinkVerificationInputDto
  ): Promise<{
    success: boolean;
    data?: MagicLinkVerificationResponseDto;
    message?: string;
  }> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Magic Link service is disabled'
        };
      }

      this.logger.log(`🔗 Verifying magic link token: ${body.token.substring(0, 8)}...`);

      const result = await this.magicLinkService.verifyMagicLink(body.token);

      const responseData: MagicLinkVerificationResponseDto = {
        success: result.success,
        status: result.status,
        message: result.message,
        accessToken: result.authResponse?.access_token,
        refreshToken: result.authResponse?.refresh_token,
        tokenType: result.authResponse?.token_type,
        expiresIn: result.authResponse?.expires_in,
        requiresMFA: result.requiresMFA
      };

      return {
        success: result.success,
        data: responseData,
        message: result.message
      };

    } catch (error) {
      this.logger.error(`❌ Failed to verify magic link:`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Magic link verification failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Obtenir le statut des Magic Links pour un email
   */
  @Get('magic-link/status')
  async getMagicLinkStatus(
    @Query('email') email: string
  ): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    try {
      if (!email) {
        throw new HttpException('Email parameter is required', HttpStatus.BAD_REQUEST);
      }

      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Magic Link service is disabled'
        };
      }

      const links = await this.magicLinkService.getMagicLinksByEmail(email);
      
      return {
        success: true,
        data: {
          email,
          links: links.map(link => ({
            id: link.id,
            status: link.status,
            action: link.action,
            createdAt: link.createdAt,
            expiresAt: link.expiresAt,
            usedAt: link.usedAt
          })),
          count: links.length
        }
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get magic link status for ${email}:`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get magic link status',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Révoquer un Magic Link spécifique
   */
  @Delete('magic-link/:linkId')
  async revokeMagicLink(
    @Param('linkId') linkId: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Magic Link service is disabled'
        };
      }

      await this.magicLinkService.revokeMagicLink(linkId);
      
      return {
        success: true,
        message: 'Magic Link revoked successfully'
      };

    } catch (error) {
      this.logger.error(`❌ Failed to revoke magic link ${linkId}:`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to revoke magic link',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Initier une authentification passwordless
   */
  @Post('passwordless/initiate')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async initiatePasswordlessAuth(
    @Body() body: {
      email: string;
      action?: 'login' | 'register';
      redirectUrl?: string;
    },
    @Req() req?: any
  ): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Passwordless authentication is disabled'
        };
      }

      this.logger.log(`🔗 Initiating passwordless auth for: ${body.email}`);

      const context = {
        ip: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get('User-Agent'),
        deviceFingerprint: req?.body?.deviceFingerprint
      };

      const result = await this.magicLinkService.initiatePasswordlessAuth({
        email: body.email,
        action: body.action || 'login',
        redirectUrl: body.redirectUrl,
        context
      });

      return {
        success: result.success,
        data: {
          method: result.method,
          linkId: result.linkId,
          message: result.message,
          expiresAt: result.expiresAt,
          maskedDestination: result.maskedDestination
        }
      };

    } catch (error) {
      this.logger.error(`❌ Failed to initiate passwordless auth for ${body.email}:`, error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to initiate passwordless authentication',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Santé du service Magic Link
   */
  @Get('magic-link/health')
  async getMagicLinkHealth(): Promise<{
    success: boolean;
    data?: any;
  }> {
    try {
      const health = await this.magicLinkService.getServiceHealth();
      
      return {
        success: health.status === 'healthy',
        data: health
      };

    } catch (error) {
      this.logger.error('❌ Failed to get magic link health:', error);
      return {
        success: false,
        data: {
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Nettoyage des liens expirés (endpoint admin)
   */
  @Post('magic-link/cleanup')
  async cleanupExpiredLinks(): Promise<{
    success: boolean;
    data?: any;
    message: string;
  }> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return {
          success: false,
          message: 'Magic Link service is disabled'
        };
      }

      const cleaned = await this.magicLinkService.cleanupExpiredLinks();
      
      return {
        success: true,
        data: { cleanedCount: cleaned },
        message: `Cleaned up ${cleaned} expired magic links`
      };

    } catch (error) {
      this.logger.error('❌ Failed to cleanup expired links:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to cleanup expired links',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}