// mu-auth/src/auth/resolvers/oauth.resolver.ts
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
   * Générer une URL d'autorisation OAuth
   */
  @Mutation(() => OAuthAuthorizationResponse)
  async generateOAuthUrl(
    @Args('input') input: OAuthAuthorizationInput,
    @Context() context?: any
  ): Promise<OAuthAuthorizationResponse> {
    try {
      this.logger.log(`🔐 Generating OAuth URL for provider: ${input.provider}`);

      if (!this.oauthService.isProviderEnabled(input.provider)) {
        throw new HttpException(
          `OAuth provider ${input.provider} is not enabled`,
          HttpStatus.BAD_REQUEST
        );
      }

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OAuth URL generation timeout')), 10000); // 10 secondes
      });

      const urlGenerationPromise = this.oauthService.getAuthorizationUrl({
        provider: input.provider as 'google' | 'github',
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        additionalParams: {
          userAgent: context?.req?.get('User-Agent'),
          ip: context?.req?.ip
        }
      });

      const result = await this.oauthService.getAuthorizationUrl({
        provider: input.provider as 'google' | 'github',
        redirectUri: input.redirectUri,
        scopes: input.scopes,
        additionalParams: {
          //originalUrl: input.originalUrl,
          userAgent: context?.req?.get('User-Agent'),
          ip: context?.req?.ip
        }
      });

      this.logger.log(`✅ OAuth URL generated successfully for ${input.provider}`);

      return {
        success: true,
        authUrl: result.authUrl,
        state: result.state,
        provider: result.provider,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        message: 'Authorization URL generated successfully'
      };

    } catch (error) {
      this.logger.error(`❌ Failed to generate OAuth URL for ${input.provider}:`, error);
      
      return {
        success: false,
        authUrl: '',
        state: '',
        provider: input.provider,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Traiter un callback OAuth
   */
  @Mutation(() => OAuthCallbackResponse)
  async handleOAuthCallback(
    @Args('input') input: OAuthCallbackInput,
    @Context() context?: any
  ): Promise<OAuthCallbackResponse> {
    try {
      this.logger.log(`🔄 Processing OAuth callback for provider: ${input.provider}`);

      const result = await this.oauthService.handleCallback({
        provider: input.provider as 'google' | 'github',
        code: input.code,
        state: input.state,
        error: input.error,
        error_description: input.errorDescription
      });

      if (result.success && result.keycloakTokens) {
        this.logger.log(`✅ OAuth callback processed successfully for ${input.provider}`);
        
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
            tokenType:  'Bearer',
            expiresIn: result.keycloakTokens.expires_in,
            idToken: result.keycloakTokens.id_token
          } : undefined,
          message: result.message
        };
      } else {
        this.logger.error(`❌ OAuth callback failed for ${input.provider}: ${result.error}`);
        
        return {
          success: false,
          message: result.error || result.message || 'OAuth authentication failed'
        };
      }

    } catch (error) {
      this.logger.error(`❌ OAuth callback processing failed for ${input.provider}:`, error);
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Callback processing failed'
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
        return false;
      }

      const config = await this.oauthService.getProviderConfig(provider);
      
      // Tests de configuration de base
      const hasRequiredConfig = !!(config?.clientId && config?.clientSecret && config?.redirectUri);

      this.logger.log(`OAuth provider ${provider} test result: ${hasRequiredConfig}`);
      
      return hasRequiredConfig;

    } catch (error) {
      this.logger.error(`❌ Provider test failed for ${provider}:`, error);
      return false;
    }
  }

  // Méthodes utilitaires privées

  private getProviderDisplayName(provider: string): string {
    const names: Record<string, string> = {
      google: 'Google',
      github: 'GitHub'
    };
    return names[provider] || provider;
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
    return descriptions[provider] || `Sign in with ${provider}`;
  }
}