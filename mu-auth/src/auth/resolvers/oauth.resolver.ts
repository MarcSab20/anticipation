// mu-auth/src/auth/resolvers/oauth.resolver.ts - Version corrigée
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
   * Générer une URL d'autorisation OAuth - Version corrigée
   */
  @Mutation(() => OAuthAuthorizationResponse)
  async generateOAuthUrl(
    @Args('input') input: OAuthAuthorizationInput,
    @Context() context?: any
  ): Promise<OAuthAuthorizationResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`🔐 Generating OAuth URL for provider: ${input.provider}`);

      // 🔧 FIX 1: Vérification précoce du provider
      if (!this.oauthService.isProviderEnabled(input.provider)) {
        this.logger.error(`❌ OAuth provider ${input.provider} is not enabled or configured`);
        return {
          success: false,
          authUrl: '',
          state: '',
          provider: input.provider,
          message: `OAuth provider ${input.provider} is not enabled or configured`
        };
      }

      // 🔧 FIX 2: Suppression du timeout Promise.race problématique
      this.logger.debug(`🔄 Calling OAuth service for ${input.provider}...`);
      
      const result = await this.oauthService.getAuthorizationUrl({
        provider: input.provider as 'google' | 'github',
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        additionalParams: {
          userAgent: context?.req?.get('User-Agent'),
          ip: context?.req?.ip
        }
      });

      this.logger.log(`✅ OAuth URL generated successfully for ${input.provider} in ${Date.now() - startTime}ms`);

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
      
      // 🔧 FIX 3: Retourner une réponse d'erreur au lieu de throw
      return {
        success: false,
        authUrl: '',
        state: '',
        provider: input.provider,
        message: this.getErrorMessage(error)
      };
    }
  }

  /**
   * Traiter un callback OAuth - Version améliorée
   */
  @Mutation(() => OAuthCallbackResponse)
  async handleOAuthCallback(
    @Args('input') input: OAuthCallbackInput,
    @Context() context?: any
  ): Promise<OAuthCallbackResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`🔄 Processing OAuth callback for provider: ${input.provider}`);

      // Validation des inputs
      if (!input.code && !input.error) {
        return {
          success: false,
          message: 'Missing authorization code or error information'
        };
      }

      if (input.error) {
        this.logger.warn(`⚠️ OAuth error received: ${input.error} - ${input.errorDescription || ''}`);
        return {
          success: false,
          message: `OAuth error: ${input.error}${input.errorDescription ? ` - ${input.errorDescription}` : ''}`
        };
      }

      const result = await this.oauthService.handleCallback({
        provider: input.provider as 'google' | 'github',
        code: input.code,
        state: input.state,
        error: input.error,
        error_description: input.errorDescription
      });

      const duration = Date.now() - startTime;

      if (result.success && result.keycloakTokens) {
        this.logger.log(`✅ OAuth callback processed successfully for ${input.provider} in ${duration}ms`);
        
        return {
          success: true,
          userInfo: result.userInfo ? {
            id: result.userInfo.id,
            email: result.userInfo.email,
            name: result.userInfo.name,
            firstName: result.userInfo.firstName,
            lastName: result.userInfo.lastName,
            avatarUrl: result.userInfo.avatarUrl,
            username: result.userInfo.username,
            verified: result.userInfo.verified,
            provider: result.userInfo.provider
          } : undefined,
          tokens: result.keycloakTokens ? {
            accessToken: result.keycloakTokens.access_token,
            refreshToken: result.keycloakTokens.refresh_token,
            tokenType: 'Bearer',
            expiresIn: result.keycloakTokens.expires_in,
            idToken: result.keycloakTokens.id_token
          } : undefined,
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
        message: this.getErrorMessage(error)
      };
    }
  }

  /**
   * Lier un compte OAuth à un utilisateur existant
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

  /**
   * Délier un compte OAuth
   */
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

  /**
   * Rafraîchir un token OAuth
   */
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
   * Obtenir les comptes OAuth liés d'un utilisateur
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

  /**
   * Obtenir les providers OAuth disponibles
   */
  @Query(() => [OAuthProviderInfo])
  async getAvailableOAuthProviders(): Promise<OAuthProviderInfo[]> {
    try {
      const enabledProviders = this.oauthService.getEnabledProviders();

      const providersInfo = await Promise.all(
        enabledProviders.map(async (provider) => {
          const config = await this.oauthService.getProviderConfig(provider);
          return {
            name: provider,
            displayName: this.getProviderDisplayName(provider),
            enabled: true,
            scopes: config?.scopes || [],
            authUrl: `/auth/oauth/authorize?provider=${provider}`,
            supportsRefresh: provider === 'google', // GitHub OAuth Apps ne supportent pas le refresh
            iconUrl: this.getProviderIconUrl(provider),
            description: this.getProviderDescription(provider)
          };
        })
      );

      return providersInfo;

    } catch (error) {
      this.logger.error(`❌ Failed to get available providers:`, error);
      return [];
    }
  }

  /**
   * Vérifier le statut d'un provider OAuth
   */
  @Query(() => OAuthProviderInfo, { nullable: true })
  async getOAuthProviderStatus(@Args('provider') provider: string): Promise<OAuthProviderInfo | null> {
    try {
      const isEnabled = this.oauthService.isProviderEnabled(provider);
      
      if (!isEnabled) {
        return null;
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

  /**
   * Tester la configuration d'un provider OAuth
   */
  @Query(() => Boolean)
  async testOAuthProvider(@Args('provider') provider: string): Promise<boolean> {
    try {
      if (!this.oauthService.isProviderEnabled(provider)) {
        this.logger.warn(`⚠️ OAuth provider ${provider} is not enabled`);
        return false;
      }

      const config = await this.oauthService.getProviderConfig(provider);
      
      // Tests de configuration de base
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

  /**
   * 🔧 Nouvelle méthode: Santé du service OAuth
   */
  @Query(() => Boolean)
  async isOAuthServiceHealthy(): Promise<boolean> {
    try {
      const enabledProviders = this.oauthService.getEnabledProviders();
      
      if (enabledProviders.length === 0) {
        this.logger.warn('⚠️ No OAuth providers are enabled');
        return false;
      }

      // Tester chaque provider
      const tests = await Promise.all(
        enabledProviders.map(provider => this.testOAuthProvider(provider))
      );

      const allHealthy = tests.every(Boolean);
      
      this.logger.log(`🏥 OAuth service health check: ${allHealthy ? 'HEALTHY' : 'UNHEALTHY'} (${enabledProviders.length} providers)`);
      
      return allHealthy;

    } catch (error) {
      this.logger.error('❌ OAuth health check failed:', error);
      return false;
    }
  }

  // ============================================================================
  // MÉTHODES UTILITAIRES PRIVÉES
  // ============================================================================

  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      // Masquer les détails sensibles en production
      if (process.env.NODE_ENV === 'production') {
        // Messages d'erreur génériques pour la production
        if (error.message.includes('timeout')) {
          return 'Service temporarily unavailable. Please try again.';
        }
        if (error.message.includes('connection') || error.message.includes('Redis')) {
          return 'Connection error. Please try again later.';
        }
        if (error.message.includes('not found') || error.message.includes('not enabled')) {
          return 'OAuth provider not available.';
        }
        return 'An error occurred during OAuth authentication.';
      } else {
        // Messages détaillés en développement
        return error.message;
      }
    }
    
    return 'Unknown error occurred';
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