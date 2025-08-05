// mu-auth/src/auth/services/oauth.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { 
  OAuthServiceImpl,
  OAuthAuthorizationRequest,
  OAuthAuthorizationResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  LinkedAccount,
  OAuthTokenResponse,
  loadOAuthConfig,
  OAuthConfig
} from 'smp-auth-ts';

@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);
  private oauthServiceImpl: OAuthServiceImpl | null = null;
  private config: OAuthConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('🔄 Initializing OAuth service...');
      
      // Charger la configuration OAuth
      this.config = this.loadOAuthConfiguration();
      
      // Vérifier si au moins un provider est configuré
      const hasEnabledProvider = 
        (this.config.google?.enabled && this.config.google.clientId) ||
        (this.config.github?.enabled && this.config.github.clientId);

      if (!hasEnabledProvider) {
        this.logger.warn('⚠️ No OAuth providers are enabled or configured');
        return;
      }

      // Initialiser le service OAuth avec les clients de AuthService
      this.oauthServiceImpl = new OAuthServiceImpl(
        this.authService['redisClient'], // Accès au RedisClient depuis AuthService
        this.authService['keycloakClient'], // Accès au KeycloakClient depuis AuthService
        this.config
      );

      this.setupEventHandlers();

      const enabledProviders = this.getEnabledProviders();
      this.logger.log(`✅ OAuth service initialized with providers: ${enabledProviders.join(', ')}`);
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize OAuth service:', error);
      throw error;
    }
  }

  private loadOAuthConfiguration(): OAuthConfig {
    return loadOAuthConfig({
      google: {
        clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
        redirectUri: this.configService.get<string>('GOOGLE_REDIRECT_URI') || 
          `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/auth/callback/google`,
        scopes: this.configService.get<string>('GOOGLE_SCOPES', 'openid,email,profile').split(','),
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        enabled: this.configService.get<boolean>('GOOGLE_OAUTH_ENABLED', false),
        hostedDomain: this.configService.get<string>('GOOGLE_HOSTED_DOMAIN'),
        accessType: 'online',
        prompt: 'select_account'
      },
      github: {
        clientId: this.configService.get<string>('GITHUB_CLIENT_ID', ''),
        clientSecret: this.configService.get<string>('GITHUB_CLIENT_SECRET', ''),
        redirectUri: this.configService.get<string>('GITHUB_REDIRECT_URI') || 
          `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/auth/callback/github`,
        scopes: this.configService.get<string>('GITHUB_SCOPES', 'user:email,read:user').split(','),
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
        enabled: this.configService.get<boolean>('GITHUB_OAUTH_ENABLED', false),
        allowSignup: this.configService.get<boolean>('GITHUB_ALLOW_SIGNUP', true),
        organizationId: this.configService.get<string>('GITHUB_ORGANIZATION_ID')
      },
      keycloak: {
        brokerCallbackUrl: `${this.configService.get<string>('KEYCLOAK_URL')}/realms/${this.configService.get<string>('KEYCLOAK_REALM')}/broker/{alias}/endpoint`,
        defaultRoles: this.configService.get<string>('OAUTH_DEFAULT_ROLES', 'USER').split(','),
        autoCreateUser: this.configService.get<boolean>('OAUTH_AUTO_CREATE_USER', true),
        syncMode: 'import'
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.oauthServiceImpl) return;

    this.oauthServiceImpl.addEventListener('oauth_authorization_completed', async (event) => {
      this.logger.log(`🎉 OAuth authorization completed: ${event.provider} - ${event.email}`);
      
      // Ici vous pouvez ajouter une logique supplémentaire
      // comme synchroniser avec votre base de données PostgreSQL
    });

    this.oauthServiceImpl.addEventListener('oauth_authorization_failed', async (event) => {
      this.logger.error(`❌ OAuth authorization failed: ${event.provider} - ${event.error}`);
    });

    this.oauthServiceImpl.addEventListener('oauth_account_linked', async (event) => {
      this.logger.log(`🔗 OAuth account linked: ${event.provider} for user ${event.userId}`);
    });

    this.oauthServiceImpl.addEventListener('oauth_account_unlinked', async (event) => {
      this.logger.log(`🔗 OAuth account unlinked: ${event.provider} for user ${event.userId}`);
    });
  }

  // Méthodes publiques déléguées

  async getAuthorizationUrl(request: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResponse> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.getAuthorizationUrl(request);
  }

  async handleCallback(request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.handleCallback(request);
  }

  async linkAccount(userId: string, provider: string, providerUserId: string): Promise<boolean> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.linkAccount(userId, provider, providerUserId);
  }

  async unlinkAccount(userId: string, provider: string): Promise<boolean> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.unlinkAccount(userId, provider);
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.getLinkedAccounts(userId);
  }

  async refreshProviderToken(userId: string, provider: string): Promise<OAuthTokenResponse | null> {
    if (!this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized');
    }
    return this.oauthServiceImpl.refreshProviderToken(userId, provider);
  }

  // Méthodes utilitaires

  getEnabledProviders(): string[] {
    if (!this.oauthServiceImpl) {
      return [];
    }
    return this.oauthServiceImpl.getEnabledProviders();
  }

  isProviderEnabled(provider: string): boolean {
    if (!this.oauthServiceImpl) {
      return false;
    }
    return this.oauthServiceImpl.isProviderEnabled(provider);
  }

  async getProviderConfig(provider: string): Promise<any> {
    if (!this.oauthServiceImpl) {
      return null;
    }
    return this.oauthServiceImpl.getProviderConfig(provider);
  }

  /**
   * Méthode utilitaire pour générer les URLs d'authentification
   */
  getAuthenticationUrls(): Record<string, string> {
    const baseUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
    const enabledProviders = this.getEnabledProviders();
    
    const urls: Record<string, string> = {};
    
    for (const provider of enabledProviders) {
      urls[provider] = `${baseUrl}/auth/oauth/authorize?provider=${provider}`;
    }
    
    return urls;
  }

  /**
   * Obtenir la configuration publique (sans secrets)
   */
  getPublicConfig(): Record<string, any> {
    const publicConfig: Record<string, any> = {};
    
    if (this.config.google?.enabled) {
      publicConfig.google = {
        enabled: true,
        scopes: this.config.google.scopes,
        hostedDomain: this.config.google.hostedDomain
      };
    }
    
    if (this.config.github?.enabled) {
      publicConfig.github = {
        enabled: true,
        scopes: this.config.github.scopes,
        allowSignup: this.config.github.allowSignup
      };
    }
    
    return publicConfig;
  }

  /**
   * Méthode pour tester une authentification OAuth (development)
   */
  async testOAuthFlow(provider: string): Promise<{
    success: boolean;
    authUrl?: string;
    error?: string;
    steps: string[];
  }> {
    const steps: string[] = [];
    
    try {
      steps.push(`Checking if provider ${provider} is enabled`);
      
      if (!this.isProviderEnabled(provider)) {
        throw new Error(`Provider ${provider} is not enabled`);
      }
      
      steps.push(`Provider ${provider} is enabled`);
      
      steps.push('Generating authorization URL');
      const result = await this.getAuthorizationUrl({
        provider: provider as 'google' | 'github',
        redirectUri: `${this.configService.get<string>('API_URL')}/auth/oauth/callback/${provider}`,
        scopes: undefined // Utiliser les scopes par défaut
      });
      
      steps.push('Authorization URL generated successfully');
      
      return {
        success: true,
        authUrl: result.authUrl,
        steps
      };
      
    } catch (error) {
      steps.push(`Error: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        steps
      };
    }
  }
}