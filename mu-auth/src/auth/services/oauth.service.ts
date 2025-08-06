// mu-auth/src/auth/services/oauth.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { 
  createOAuthServiceFromEnv,
  OAuthServiceImpl,
  createRedisClient,
  createKeycloakClient,
  OAuthAuthorizationRequest,
  OAuthAuthorizationResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  LinkedAccount,
  OAuthTokenResponse,
  validateOAuthConfig,
  OAuthConfig,
  loadOAuthConfig
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
      
      // Charger et valider la configuration OAuth
      await this.loadAndValidateConfig();
      
      // Vérifier si au moins un provider est configuré
      const hasEnabledProvider = 
        (this.config.google?.enabled && this.config.google.clientId) ||
        (this.config.github?.enabled && this.config.github.clientId);

      if (!hasEnabledProvider) {
        this.logger.warn('⚠️ No OAuth providers are enabled or properly configured');
        this.logger.warn('🔧 Please configure GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET');
        return;
      }

      // Initialiser le service OAuth depuis smp-auth-ts
      await this.initializeSmpAuthOAuth();

      const enabledProviders = this.getEnabledProviders();
      this.logger.log(`✅ OAuth service initialized with providers: ${enabledProviders.join(', ')}`);
      
      // Logger la configuration pour le debugging
      this.logConfigurationStatus();
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize OAuth service:', error);
      
      // En cas d'erreur, on continue sans OAuth mais on log l'erreur
      this.logger.warn('⚠️ OAuth service will be disabled due to initialization error');
    }
  }

  /**
   * Charger et valider la configuration OAuth
   */
  private async loadAndValidateConfig(): Promise<void> {
    this.config = loadOAuthConfig({
      google: {
        clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
        clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
        redirectUri: this.configService.get<string>('GOOGLE_REDIRECT_URI') || 
          `${this.configService.get<string>('API_URL', 'http://localhost:3001')}/auth/oauth/callback/google`,
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
          `${this.configService.get<string>('API_URL', 'http://localhost:3001')}/auth/oauth/callback/github`,
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

    // Valider la configuration
    const validation = await validateOAuthConfig(this.config);
    
    if (!validation.valid) {
      this.logger.error('❌ OAuth configuration validation failed:', validation.errors);
      throw new Error(`OAuth configuration invalid: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      this.logger.warn('⚠️ OAuth configuration warnings:', validation.warnings);
    }
  }

  /**
   * Initialiser le service OAuth de smp-auth-ts
   */
  private async initializeSmpAuthOAuth(): Promise<void> {
    try {
      // Créer les clients Redis et Keycloak à partir de la configuration existante
      const redisConfig = {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD'),
        db: this.configService.get<number>('REDIS_DB', 0),
        prefix: this.configService.get<string>('OAUTH_REDIS_PREFIX', 'oauth:')
      };

      const keycloakConfig = {
        url: this.configService.get<string>('KEYCLOAK_URL', 'http://localhost:8080'),
        realm: this.configService.get<string>('KEYCLOAK_REALM', 'mu-realm'),
        clientId: this.configService.get<string>('KEYCLOAK_CLIENT_ID', 'mu-client'),
        clientSecret: this.configService.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
        adminClientId: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID'),
        adminClientSecret: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET')
      };

      const redisClient = createRedisClient(redisConfig);
      const keycloakClient = createKeycloakClient(keycloakConfig);

      // Créer le service OAuth
      this.oauthServiceImpl = createOAuthServiceFromEnv(redisClient, keycloakClient);

      this.setupEventHandlers();

    } catch (error) {
      this.logger.error('❌ Failed to create OAuth service from smp-auth-ts:', error);
      throw error;
    }
  }

  /**
   * Configurer les gestionnaires d'événements
   */
  private setupEventHandlers(): void {
    if (!this.oauthServiceImpl) return;

    this.oauthServiceImpl.addEventListener('oauth_authorization_completed', async (event) => {
      this.logger.log(`🎉 OAuth authorization completed: ${event.provider} - ${event.email}`);
      
      // Synchroniser avec la base de données locale si nécessaire
      // await this.syncOAuthUser(event);
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

  /**
   * Logger le statut de la configuration
   */
  private logConfigurationStatus(): void {
    this.logger.log('🔍 =================================');
    this.logger.log('🔍 OAUTH CONFIGURATION STATUS');
    this.logger.log('🔍 =================================');
    
    const providers = ['google', 'github'];
    
    for (const provider of providers) {
      const config = this.config[provider as keyof OAuthConfig] as any;
      const enabled = config?.enabled || false;
      const configured = !!(config?.clientId && config?.clientSecret);
      const status = enabled && configured ? '✅' : enabled ? '🔶' : '❌';
      
      this.logger.log(`🔍 ${provider.toUpperCase()}: ${status} ${enabled ? 'ENABLED' : 'DISABLED'} ${configured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
      
      if (enabled && !configured) {
        this.logger.warn(`⚠️ ${provider.toUpperCase()}: Enabled but missing credentials`);
      }
    }
    
    this.logger.log('🔍 =================================');
  }

  // ============================================================================
  // MÉTHODES PUBLIQUES - Interface avec smp-auth-ts
  // ============================================================================

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

  // ============================================================================
  // MÉTHODES UTILITAIRES
  // ============================================================================

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
   * Vérifier la santé du service OAuth
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    activeProviders: number;
    availableProviders: string[];
    issues: string[];
    lastChecked: string;
  }> {
    const issues: string[] = [];
    const availableProviders = this.getEnabledProviders();
    
    if (!this.oauthServiceImpl) {
      issues.push('OAuth service not initialized');
    }
    
    if (availableProviders.length === 0) {
      issues.push('No OAuth providers are enabled');
    }

    // Tester la connectivité Redis (si accessible)
    try {
      // Test simple de connectivité
      // await this.oauthServiceImpl?.testConnection?.();
    } catch (error) {
      issues.push(`Redis connectivity issue: ${error}`);
    }

    return {
      healthy: issues.length === 0,
      activeProviders: availableProviders.length,
      availableProviders,
      issues,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Générer les URLs d'authentification pour tous les providers
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
        hostedDomain: this.config.google.hostedDomain,
        displayName: 'Google',
        iconUrl: 'https://developers.google.com/identity/images/g-logo.png'
      };
    }
    
    if (this.config.github?.enabled) {
      publicConfig.github = {
        enabled: true,
        scopes: this.config.github.scopes,
        allowSignup: this.config.github.allowSignup,
        displayName: 'GitHub',
        iconUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
      };
    }
    
    return publicConfig;
  }

  /**
   * Tester un provider OAuth (pour debugging)
   */
  async testProvider(provider: string): Promise<{
    success: boolean;
    authUrl?: string;
    error?: string;
    steps: string[];
  }> {
    const steps: string[] = [];
    
    try {
      steps.push(`Checking if provider ${provider} is enabled`);
      
      if (!this.isProviderEnabled(provider)) {
        throw new Error(`Provider ${provider} is not enabled or configured`);
      }
      
      steps.push(`Provider ${provider} is enabled`);
      
      steps.push('Generating test authorization URL');
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
      steps.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        steps
      };
    }
  }

  /**
   * Nettoyer les ressources
   */
  async onModuleDestroy(): Promise<void> {
    if (this.oauthServiceImpl) {
      try {
        await this.oauthServiceImpl.close();
        this.logger.log('✅ OAuth service closed successfully');
      } catch (error) {
        this.logger.error('❌ Error closing OAuth service:', error);
      }
    }
  }
}