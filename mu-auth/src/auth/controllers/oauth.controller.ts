// mu-auth/src/auth/controllers/oauth.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  Req,
  Res,
  HttpException,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { IsString, IsOptional, IsIn, IsArray } from 'class-validator';
import { Request, Response } from 'express';
import { OAuthService } from '../services/oauth.service';

// DTOs pour validation
class OAuthAuthorizationDto {
  @IsString()
  @IsIn(['google', 'github'])
  provider: 'google' | 'github';

  @IsOptional()
  @IsString()
  redirectUri?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsString()
  originalUrl?: string;
}

class OAuthCallbackDto {
  @IsString()
  @IsIn(['google', 'github'])
  provider: 'google' | 'github';

  @IsString()
  code: string;

  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  error_description?: string;
}

class LinkAccountDto {
  @IsString()
  userId: string;

  @IsString()
  @IsIn(['google', 'github'])
  provider: 'google' | 'github';

  @IsString()
  providerUserId: string;
}

@Controller('auth/oauth')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Initier l'authentification OAuth
   * GET /auth/oauth/authorize?provider=google&redirectUri=...
   */
  @Get('authorize')
  async authorize(
    @Query() query: OAuthAuthorizationDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
      this.logger.log(`🔐 Starting OAuth authorization for provider: ${query.provider}`);

      const result = await this.oauthService.getAuthorizationUrl({
        provider: query.provider,
        redirectUri: query.redirectUri,
        scopes: query.scopes,
        
      });

      this.logger.log(`✅ OAuth authorization URL generated for ${query.provider}`);

      // Rediriger vers le provider OAuth
      res.redirect(result.authUrl);

    } catch (error) {
      this.logger.error(`❌ OAuth authorization failed for ${query.provider}:`, error);
      
      // Rediriger vers le frontend avec erreur
      const errorUrl = query.redirectUri || `${process.env.FRONTEND_URL}/auth/error`;
      const separator = errorUrl.includes('?') ? '&' : '?';
      res.redirect(`${errorUrl}${separator}error=oauth_error&message=${encodeURIComponent(error.message)}`);
    }
  }

  /**
   * Gérer le callback OAuth
   * GET /auth/oauth/callback/:provider?code=...&state=...
   */
  @Get('callback/:provider')
  async callback(
    @Res() res: Response,
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
    //@Req() req: Request,
    
  ): Promise<void> {
    try {
      this.logger.log(`🔄 Processing OAuth callback for provider: ${provider}`);

      const callbackData: OAuthCallbackDto = {
        provider: provider as 'google' | 'github',
        code,
        state,
        error,
        error_description: errorDescription
      };

      const result = await this.oauthService.handleCallback(callbackData);

      if (result.success && result.keycloakTokens) {
        this.logger.log(`✅ OAuth authentication successful for ${provider}: ${result.userInfo?.email}`);

        // Créer une URL de succès avec les tokens
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const successUrl = `${frontendUrl}/auth/success`;
        
        // Option 1: Redirection avec tokens en query params (moins sécurisé)
        const params = new URLSearchParams({
          access_token: result.keycloakTokens.access_token,
          token_type: 'Bearer',
          expires_in: result.keycloakTokens.expires_in.toString(),
          provider,
          email: result.userInfo?.email || '',
          name: result.userInfo?.name || ''
        });

        if (result.keycloakTokens.refresh_token) {
          params.append('refresh_token', result.keycloakTokens.refresh_token);
        }

        res.redirect(`${successUrl}?${params.toString()}`);

      } else {
        this.logger.error(`❌ OAuth authentication failed for ${provider}: ${result.error}`);

        const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`;
        const params = new URLSearchParams({
          error: 'oauth_authentication_failed',
          message: result.error || 'Authentication failed',
          provider
        });

        res.redirect(`${errorUrl}?${params.toString()}`);
      }

    } catch (error) {
      this.logger.error(`❌ OAuth callback processing failed for ${provider}:`, error);

      const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`;
      const params = new URLSearchParams({
        error: 'callback_processing_error',
        message: error.message || 'Callback processing failed',
        provider
      });

      res.redirect(`${errorUrl}?${params.toString()}`);
    }
  }

  /**
   * Version POST du callback pour les intégrations SPA
   * POST /auth/oauth/callback
   */
  @Post('callback')
  async callbackPost(@Body() body: OAuthCallbackDto) {
    try {
      this.logger.log(`🔄 Processing OAuth POST callback for provider: ${body.provider}`);

      const result = await this.oauthService.handleCallback(body);

      if (result.success) {
        this.logger.log(`✅ OAuth POST authentication successful for ${body.provider}`);
        
        return {
          success: true,
          data: {
            userInfo: {
              id: result.userInfo?.id,
              email: result.userInfo?.email,
              name: result.userInfo?.name,
              firstName: result.userInfo?.firstName,
              lastName: result.userInfo?.lastName,
              avatarUrl: result.userInfo?.avatarUrl,
              username: result.userInfo?.username,
              verified: result.userInfo?.verified,
              provider: result.userInfo?.provider
            },
            tokens: result.keycloakTokens ? {
              accessToken: result.keycloakTokens.access_token,
              refreshToken: result.keycloakTokens.refresh_token,
              tokenType:  'Bearer',
              expiresIn: result.keycloakTokens.expires_in
            } : undefined
          },
          message: result.message
        };
      } else {
        return {
          success: false,
          error: result.error,
          message: result.message
        };
      }

    } catch (error) {
      this.logger.error(`❌ OAuth POST callback failed for ${body.provider}:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get available providers',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Vérifier le statut d'un provider OAuth
   * GET /auth/oauth/status/:provider
   */
  @Get('status/:provider')
  async getProviderStatus(@Param('provider') provider: string) {
    try {
      const isEnabled = this.oauthService.isProviderEnabled(provider);
      const config = await this.oauthService.getProviderConfig(provider);

      return {
        success: true,
        data: {
          provider,
          enabled: isEnabled,
          configured: !!config?.clientId,
          scopes: config?.scopes || [],
          features: {
            refreshToken: provider === 'google', // GitHub OAuth Apps ne supportent pas refresh tokens
            userInfo: true,
            emailRequired: true
          }
        }
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get provider status for ${provider}:`, error);
      
      return {
        success: false,
        message: `Failed to get status for provider ${provider}`,
        error: error.message
      };
    }
  }

  /**
   * Endpoint de test pour vérifier la configuration OAuth
   * GET /auth/oauth/test/:provider
   */
  @Get('test/:provider')
  async testProvider(@Param('provider') provider: string) {
    try {
      const isEnabled = this.oauthService.isProviderEnabled(provider);
      
      if (!isEnabled) {
        return {
          success: false,
          message: `Provider ${provider} is not enabled or configured`
        };
      }

      const config = await this.oauthService.getProviderConfig(provider);
      
      // Tests de configuration de base
      const tests = {
        clientId: !!config?.clientId,
        clientSecret: !!config?.clientSecret,
        redirectUri: !!config?.redirectUri,
        authUrl: !!config?.authUrl,
        tokenUrl: !!config?.tokenUrl,
        userInfoUrl: !!config?.userInfoUrl
      };

      const allPassed = Object.values(tests).every(Boolean);

      return {
        success: allPassed,
        data: {
          provider,
          tests,
          overallStatus: allPassed ? 'READY' : 'MISCONFIGURED',
          message: allPassed 
            ? `${provider} provider is properly configured`
            : `${provider} provider has configuration issues`
        }
      };

    } catch (error) {
      this.logger.error(`❌ Provider test failed for ${provider}:`, error);
      
      return {
        success: false,
        message: `Provider test failed for ${provider}`,
        error: error.message
      };
    }
  }  

  /**
   * Lier un compte OAuth à un utilisateur existant
   * POST /auth/oauth/link
   */
  @Post('link')
  async linkAccount(@Body() body: LinkAccountDto) {
    try {
      this.logger.log(`🔗 Linking ${body.provider} account for user: ${body.userId}`);

      const success = await this.oauthService.linkAccount(
        body.userId,
        body.provider,
        body.providerUserId
      );

      if (success) {
        this.logger.log(`✅ Account linked successfully: ${body.userId} -> ${body.provider}`);
        return {
          success: true,
          message: `${body.provider} account linked successfully`
        };
      } else {
        return {
          success: false,
          message: 'Failed to link account'
        };
      }

    } catch (error) {
      this.logger.error(`❌ Account linking failed:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Account linking failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Délier un compte OAuth
   * DELETE /auth/oauth/link/:userId/:provider
   */
  @Delete('link/:userId/:provider')
  async unlinkAccount(
    @Param('userId') userId: string,
    @Param('provider') provider: string
  ) {
    try {
      this.logger.log(`🔗 Unlinking ${provider} account for user: ${userId}`);

      const success = await this.oauthService.unlinkAccount(userId, provider);

      if (success) {
        this.logger.log(`✅ Account unlinked successfully: ${userId} -> ${provider}`);
        return {
          success: true,
          message: `${provider} account unlinked successfully`
        };
      } else {
        return {
          success: false,
          message: 'Failed to unlink account or account not found'
        };
      }

    } catch (error) {
      this.logger.error(`❌ Account unlinking failed:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Account unlinking failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Obtenir les comptes liés d'un utilisateur
   * GET /auth/oauth/linked/:userId
   */
  @Get('linked/:userId')
  async getLinkedAccounts(@Param('userId') userId: string) {
    try {
      const linkedAccounts = await this.oauthService.getLinkedAccounts(userId);

      return {
        success: true,
        data: {
          userId,
          linkedAccounts: linkedAccounts.map(account => ({
            provider: account.provider,
            email: account.email,
            username: account.username,
            linkedAt: account.linkedAt,
            lastSync: account.lastSync
          })),
          count: linkedAccounts.length
        }
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get linked accounts for ${userId}:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get linked accounts',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Rafraîchir un token OAuth
   * POST /auth/oauth/refresh/:userId/:provider
   */
  @Post('refresh/:userId/:provider')
  async refreshToken(
    @Param('userId') userId: string,
    @Param('provider') provider: string
  ) {
    try {
      this.logger.log(`🔄 Refreshing ${provider} token for user: ${userId}`);

      const newTokens = await this.oauthService.refreshProviderToken(userId, provider);

      if (newTokens) {
        this.logger.log(`✅ Token refreshed successfully for ${userId} -> ${provider}`);
        return {
          success: true,
          data: {
            accessToken: newTokens.access_token,
            tokenType: newTokens.token_type,
            expiresIn: newTokens.expires_in,
            scope: newTokens.scope
          }
        };
      } else {
        return {
          success: false,
          message: 'Failed to refresh token or refresh not supported'
        };
      }

    } catch (error) {
      this.logger.error(`❌ Token refresh failed for ${userId} -> ${provider}:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Token refresh failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Obtenir les providers OAuth disponibles
   * GET /auth/oauth/providers
   */
  @Get('providers')
  async getAvailableProviders() {
    try {
      const enabledProviders = this.oauthService.getEnabledProviders();

      const providersInfo = await Promise.all(
        enabledProviders.map(async (provider) => {
          const config = await this.oauthService.getProviderConfig(provider);
          return {
            name: provider,
            enabled: true,
            scopes: config?.scopes || [],
            authUrl: `/auth/oauth/authorize?provider=${provider}`
          };
        })
      );

      return {
        success: true,
        data: {
          providers: providersInfo,
          count: enabledProviders.length
        }
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get available providers:`, error);
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to get available providers',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}