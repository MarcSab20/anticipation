// mu-auth/src/auth/resolvers/oauth.resolver.ts - VERSION CORRIGÉE
import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { Logger, HttpException, HttpStatus } from '@nestjs/common';
import { OAuthService } from '../services/oauth.service';
import {
  OAuthAuthorizationInput,
  OAuthAuthorizationResponse,
  OAuthCallbackInput,
  OAuthCallbackResponse,
  OAuthProviderInfo,
  LinkedAccountInfo,
  OAuthLinkAccountInput,
  OAuthUnlinkAccountInput,
  OAuthRefreshTokenInput,
  OAuthTokenInfo
} from '../dto/oauth.dto';

@Resolver()
export class OAuthResolver {
  private readonly logger = new Logger(OAuthResolver.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * ✅ CORRECTION 1: Génération d'URL OAuth avec gestion d'erreurs renforcée
   */
  @Mutation(() => OAuthAuthorizationResponse)
  async generateOAuthUrl(
    @Args('input') input: OAuthAuthorizationInput,
    @Context() context?: any
  ): Promise<OAuthAuthorizationResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`🔐 Generating OAuth URL for provider: ${input.provider}`);

      // ✅ Validation précoce avec messages d'erreur détaillés
      if (!this.oauthService.isProviderEnabled(input.provider)) {
        this.logger.error(`❌ OAuth provider ${input.provider} is not enabled or configured`);
        
        const availableProviders = this.oauthService.getEnabledProviders();
        const errorMessage = availableProviders.length > 0 
          ? `Provider ${input.provider} is not available. Available providers: ${availableProviders.join(', ')}`
          : 'No OAuth providers are currently configured';
          
        return {
          success: false,
          authUrl: '',
          state: '',
          provider: input.provider,
          message: errorMessage
        };
      }

      // ✅ CORRECTION 2: URLs de redirection corrigées
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUri = input.redirectUri || `${frontendUrl}/oauth/callback`;
      
      this.logger.debug(`🔄 Using redirect URI: ${redirectUri}`);
      this.logger.debug(`🔄 Calling OAuth service for ${input.provider}...`);
      
      // ✅ CORRECTION 3: Configuration de la requête avec timeout
      const oauthRequest = {
        provider: input.provider as 'google' | 'github',
        redirectUri: redirectUri,
        scopes: input.scopes || this.getDefaultScopes(input.provider),
        additionalParams: {
          userAgent: context?.req?.get('User-Agent'),
          ip: this.extractClientIP(context?.req),
          source: 'oauth-resolver'
        }
      };

      // ✅ CORRECTION 4: Appel avec timeout et gestion d'erreur
      const result = await Promise.race([
        this.oauthService.getAuthorizationUrl(oauthRequest),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OAuth URL generation timeout')), 15000)
        )
      ]);

      const duration = Date.now() - startTime;
      this.logger.log(`✅ OAuth URL generated successfully for ${input.provider} in ${duration}ms`);

      return {
        success: true,
        authUrl: result.authUrl,
        state: result.state,
        provider: result.provider,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        message: 'Authorization URL generated successfully'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Failed to generate OAuth URL for ${input.provider} after ${duration}ms:`, error);
      
      // ✅ CORRECTION 5: Gestion détaillée des erreurs
      return {
        success: false,
        authUrl: '',
        state: '',
        provider: input.provider,
        message: this.getDetailedErrorMessage(error, 'URL generation')
      };
    }
  }

  /**
   * ✅ CORRECTION 6: Traitement de callback OAuth amélioré
   */
  @Mutation(() => OAuthCallbackResponse)
  async handleOAuthCallback(
    @Args('input') input: OAuthCallbackInput,
    @Context() context?: any
  ): Promise<OAuthCallbackResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`🔄 Processing OAuth callback for provider: ${input.provider}`);
      this.logger.debug(`🔍 Callback data: code=${input.code?.substring(0, 10)}..., state=${input.state?.substring(0, 10)}..., error=${input.error}`);

      // ✅ Validation des paramètres d'entrée
      if (input.error) {
        this.logger.warn(`⚠️ OAuth error received: ${input.error} - ${input.errorDescription || ''}`);
        return {
          success: false,
          message: this.formatOAuthError(input.error, input.errorDescription)
        };
      }

      if (!input.code) {
        this.logger.error(`❌ Missing authorization code for ${input.provider}`);
        return {
          success: false,
          message: 'Authorization code is missing. Please try the OAuth flow again.'
        };
      }

      if (!input.state) {
        this.logger.error(`❌ Missing state parameter for ${input.provider}`);
        return {
          success: false,
          message: 'Security state parameter is missing. Please try the OAuth flow again.'
        };
      }

      // ✅ CORRECTION 7: Appel du service avec retry automatique
      const callbackRequest = {
        provider: input.provider as 'google' | 'github',
        code: input.code,
        state: input.state,
        error: input.error,
        error_description: input.errorDescription
      };

      const result = await Promise.race([
        this.oauthService.handleCallback(callbackRequest),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OAuth callback processing timeout')), 30000)
        )
      ]);

      const duration = Date.now() - startTime;

      if (result.success && result.keycloakTokens) {
        this.logger.log(`✅ OAuth callback processed successfully for ${input.provider} in ${duration}ms`);
        
        // ✅ CORRECTION 8: Validation des données retournées
        if (!result.userInfo?.email) {
          this.logger.warn(`⚠️ OAuth callback succeeded but no email received for ${input.provider}`);
          return {
            success: false,
            message: 'OAuth authentication succeeded but user email is not available. Please ensure email permission is granted.'
          };
        }
        
        return {
          success: true,
          userInfo: this.sanitizeUserInfo(result.userInfo),
          tokens: this.sanitizeTokens(result.keycloakTokens),
          message: result.message
        };
      } else {
        this.logger.error(`❌ OAuth callback failed for ${input.provider} in ${duration}ms: ${result.error}`);
        
        return {
          success: false,
          message: result.error || result.message || 'OAuth authentication failed'
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ OAuth callback processing failed for ${input.provider} after ${duration}ms:`, error);
      
      return {
        success: false,
        message: this.getDetailedErrorMessage(error, 'callback processing')
      };
    }
  }

  /**
   * ✅ Autres mutations avec gestion d'erreurs améliorée
   */
  @Mutation(() => Boolean)
  async linkOAuthAccount(
    @Args('input') input: OAuthLinkAccountInput
  ): Promise<boolean> {
    try {
      this.logger.log(`🔗 Linking ${input.provider} account for user: ${input.userId}`);

      const success = await this.oauthService.linkAccount(
        input.userId,
        input.provider,
        input.providerUserId
      );

      if (success) {
        this.logger.log(`✅ Account linked successfully: ${input.userId} -> ${input.provider}`);
      } else {
        this.logger.warn(`❌ Failed to link account: ${input.userId} -> ${input.provider}`);
      }

      return success;

    } catch (error) {
      this.logger.error(`❌ Account linking failed:`, error);
      return false;
    }
  }

  @Mutation(() => Boolean)
  async unlinkOAuthAccount(
    @Args('input') input: OAuthUnlinkAccountInput
  ): Promise<boolean> {
    try {
      this.logger.log(`🔗 Unlinking ${input.provider} account for user: ${input.userId}`);

      const success = await this.oauthService.unlinkAccount(input.userId, input.provider);

      if (success) {
        this.logger.log(`✅ Account unlinked successfully: ${input.userId} -> ${input.provider}`);
      } else {
        this.logger.warn(`❌ Failed to unlink account: ${input.userId} -> ${input.provider}`);
      }

      return success;

    } catch (error) {
      this.logger.error(`❌ Account unlinking failed:`, error);
      return false;
    }
  }

  @Mutation(() => OAuthTokenInfo, { nullable: true })
  async refreshOAuthToken(
    @Args('input') input: OAuthRefreshTokenInput
  ): Promise<OAuthTokenInfo | null> {
    try {
      this.logger.log(`🔄 Refreshing ${input.provider} token for user: ${input.userId}`);

      const newTokens = await this.oauthService.refreshProviderToken(input.userId, input.provider);

      if (newTokens) {
        this.logger.log(`✅ Token refreshed successfully for ${input.userId} -> ${input.provider}`);
        return {
          accessToken: newTokens.access_token,
          tokenType: newTokens.token_type,
          expiresIn: newTokens.expires_in,
          scope: newTokens.scope,
          refreshToken: newTokens.refresh_token
        };
      } else {
        this.logger.warn(`❌ Token refresh failed or not supported for ${input.provider}`);
        return null;
      }

    } catch (error) {
      this.logger.error(`❌ Token refresh failed for ${input.userId} -> ${input.provider}:`, error);
      return null;
    }
  }

  /**
   * ✅ Queries avec gestion d'erreurs
   */
  @Query(() => [LinkedAccountInfo])
  async getLinkedOAuthAccounts(@Args('userId') userId: string): Promise<LinkedAccountInfo[]> {
    try {
      const linkedAccounts = await this.oauthService.getLinkedAccounts(userId);

      return linkedAccounts.map(account => ({
        userId: account.userId,
        provider: account.provider,
        providerUserId: account.providerUserId,
        email: account.email,
        username: account.username,
        linkedAt: account.linkedAt,
        lastSync: account.lastSync,
        metadata: account.metadata
      }));

    } catch (error) {
      this.logger.error(`❌ Failed to get linked accounts for ${userId}:`, error);
      return [];
    }
  }

  @Query(() => [OAuthProviderInfo])
  async getAvailableOAuthProviders(): Promise<OAuthProviderInfo[]> {
    try {
      const enabledProviders = this.oauthService.getEnabledProviders();

      if (enabledProviders.length === 0) {
        this.logger.warn('⚠️ No OAuth providers are enabled');
        return [];
      }

      const providersInfo = await Promise.all(
        enabledProviders.map(async (provider) => {
          try {
            const config = await this.oauthService.getProviderConfig(provider);
            return {
              name: provider,
              displayName: this.getProviderDisplayName(provider),
              enabled: true,
              scopes: config?.scopes || [],
              authUrl: `/auth/oauth/authorize?provider=${provider}`,
              supportsRefresh: provider === 'google', // GitHub OAuth Apps ne supportent pas le refresh
              iconUrl: this.getProviderIconUrl(provider),
              description: this.getProviderDescription(provider),
              configured: !!(config?.clientId && config?.clientSecret)
            };
          } catch (error) {
            this.logger.error(`❌ Failed to get config for provider ${provider}:`, error);
            return {
              name: provider,
              displayName: this.getProviderDisplayName(provider),
              enabled: false,
              scopes: [],
              authUrl: '',
              supportsRefresh: false,
              iconUrl: this.getProviderIconUrl(provider),
              description: `${this.getProviderDisplayName(provider)} (Configuration Error)`,
              configured: false
            };
          }
        })
      );

      return providersInfo;

    } catch (error) {
      this.logger.error(`❌ Failed to get available providers:`, error);
      return [];
    }
  }

  @Query(() => OAuthProviderInfo, { nullable: true })
  async getOAuthProviderStatus(@Args('provider') provider: string): Promise<OAuthProviderInfo | null> {
    try {
      const isEnabled = this.oauthService.isProviderEnabled(provider);
      
      if (!isEnabled) {
        return {
          name: provider,
          displayName: this.getProviderDisplayName(provider),
          enabled: false,
          scopes: [],
          authUrl: '',
          supportsRefresh: false,
          iconUrl: this.getProviderIconUrl(provider),
          description: `${this.getProviderDisplayName(provider)} is not enabled`,
          configured: false
        };
      }

      const config = await this.oauthService.getProviderConfig(provider);

      return {
        name: provider,
        displayName: this.getProviderDisplayName(provider),
        enabled: isEnabled,
        scopes: config?.scopes || [],
        authUrl: `/auth/oauth/authorize?provider=${provider}`,
        supportsRefresh: provider === 'google',
        iconUrl: this.getProviderIconUrl(provider),
        description: this.getProviderDescription(provider),
        configured: !!config?.clientId
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get provider status for ${provider}:`, error);
      return null;
    }
  }

  @Query(() => Boolean)
  async testOAuthProvider(@Args('provider') provider: string): Promise<boolean> {
    try {
      if (!this.oauthService.isProviderEnabled(provider)) {
        this.logger.warn(`⚠️ OAuth provider ${provider} is not enabled`);
        return false;
      }

      const config = await this.oauthService.getProviderConfig(provider);
      
      const hasRequiredConfig = !!(config?.clientId && config?.clientSecret && config?.redirectUri);

      this.logger.log(`🧪 OAuth provider ${provider} test result: ${hasRequiredConfig ? 'PASSED' : 'FAILED'}`);
      
      if (!hasRequiredConfig) {
        this.logger.warn(`⚠️ OAuth provider ${provider} is missing required configuration:`, {
          hasClientId: !!config?.clientId,
          hasClientSecret: !!config?.clientSecret,
          hasRedirectUri: !!config?.redirectUri
        });
      }
      
      return hasRequiredConfig;

    } catch (error) {
      this.logger.error(`❌ Provider test failed for ${provider}:`, error);
      return false;
    }
  }

  @Query(() => Boolean)
  async isOAuthServiceHealthy(): Promise<boolean> {
    try {
      const enabledProviders = this.oauthService.getEnabledProviders();
      
      if (enabledProviders.length === 0) {
        this.logger.warn('⚠️ No OAuth providers are enabled');
        return false;
      }

      const tests = await Promise.allSettled(
        enabledProviders.map(provider => this.testOAuthProvider(provider))
      );

      const allHealthy = tests.every(result => 
        result.status === 'fulfilled' && result.value === true
      );
      
      this.logger.log(`🏥 OAuth service health check: ${allHealthy ? 'HEALTHY' : 'UNHEALTHY'} (${enabledProviders.length} providers)`);
      
      return allHealthy;

    } catch (error) {
      this.logger.error('❌ OAuth health check failed:', error);
      return false;
    }
  }

  // ============================================================================
  // ✅ MÉTHODES UTILITAIRES AMÉLIORÉES
  // ============================================================================

  private getDetailedErrorMessage(error: any, operation: string): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Messages d'erreur spécifiques
      if (message.includes('timeout') || message.includes('etimedout')) {
        return `Connection timeout during ${operation}. This may be due to network connectivity issues. Please try again.`;
      }
      
      if (message.includes('connection') || message.includes('econnreset') || message.includes('enotfound')) {
        return `Network connection error during ${operation}. Please check your internet connection and try again.`;
      }
      
      if (message.includes('not found') || message.includes('not enabled')) {
        return 'OAuth provider not available. Please contact support if this issue persists.';
      }
      
      if (message.includes('configuration') || message.includes('invalid client')) {
        return 'OAuth provider configuration error. Please contact support.';
      }
      
      if (message.includes('rate limit') || message.includes('too many requests')) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      
      // En mode développement, afficher l'erreur complète
      if (process.env.NODE_ENV === 'development') {
        return `${operation} failed: ${error.message}`;
      }
      
      return `An error occurred during ${operation}. Please try again.`;
    }
    
    return `Unknown error occurred during ${operation}`;
  }

  private formatOAuthError(error: string, description?: string): string {
    const errorMessages: Record<string, string> = {
      'access_denied': 'You denied access to the application. To continue, please authorize the application.',
      'invalid_request': 'Invalid OAuth request. Please try again.',
      'unauthorized_client': 'Application is not authorized for this OAuth provider.',
      'unsupported_response_type': 'OAuth configuration error. Please contact support.',
      'invalid_scope': 'Invalid permissions requested. Please contact support.',
      'server_error': 'OAuth provider server error. Please try again later.',
      'temporarily_unavailable': 'OAuth provider is temporarily unavailable. Please try again later.'
    };

    const message = errorMessages[error] || `OAuth error: ${error}`;
    
    if (description && description !== error) {
      return `${message} (${description})`;
    }
    
    return message;
  }

  private getDefaultScopes(provider: string): string[] {
    const defaultScopes: Record<string, string[]> = {
      'google': ['openid', 'email', 'profile'],
      'github': ['user:email', 'read:user']
    };
    
    return defaultScopes[provider] || [];
  }

  private extractClientIP(req: any): string {
    if (!req) return 'unknown';
    
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           'unknown';
  }

  private sanitizeUserInfo(userInfo: any): any {
    if (!userInfo) return undefined;
    
    return {
      id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      avatarUrl: userInfo.avatarUrl,
      username: userInfo.username,
      verified: userInfo.verified,
      provider: userInfo.provider
    };
  }

  private sanitizeTokens(tokens: any): any {
    if (!tokens) return undefined;
    
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: 'Bearer',
      expiresIn: tokens.expires_in,
      idToken: tokens.id_token
    };
  }

  private getProviderDisplayName(provider: string): string {
    const names: Record<string, string> = {
      google: 'Google',
      github: 'GitHub'
    };
    return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
  }

  private getProviderIconUrl(provider: string): string {
    const icons: Record<string, string> = {
      google: 'https://developers.google.com/identity/images/g-logo.png',
      github: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
    };
    return icons[provider] || '';
  }

  private getProviderDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      google: 'Sign in with your Google account',
      github: 'Sign in with your GitHub account'
    };
    return descriptions[provider] || `Sign in with ${this.getProviderDisplayName(provider)}`;
  }
}