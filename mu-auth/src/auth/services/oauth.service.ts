// mu-auth/src/auth/services/oauth.service.ts - VERSION CORRIGÉE avec gestion des timeouts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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
export class OAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OAuthService.name);
  private oauthServiceImpl: OAuthServiceImpl | null = null;
  private config: OAuthConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // ✅ CONFIGURATION DES TIMEOUTS
  private readonly TIMEOUTS = {
    NETWORK_TIMEOUT: 30000,        // 30 secondes pour les appels réseau
    RETRY_ATTEMPTS: 3,             // 3 tentatives
    RETRY_DELAY: 2000,             // 2 secondes entre les tentatives
    CONNECTION_TIMEOUT: 15000,     // 15 secondes pour établir la connexion
    OAUTH_STATE_TTL: 600,          // 10 minutes pour l'état OAuth
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService
  ) {}

  async onModuleInit() {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = this.initializeService();
    await this.initializationPromise;
  }

  private async initializeService(): Promise<void> {
    try {
      this.logger.log('🔄 Initializing OAuth service with enhanced timeout management...');
      
      // ✅ CORRECTION 1: Configuration avec timeouts
      await this.loadAndValidateConfig();
      
      const hasEnabledProvider = 
        (this.config.google?.enabled && this.config.google.clientId) ||
        (this.config.github?.enabled && this.config.github.clientId);

      if (!hasEnabledProvider) {
        this.logger.warn('⚠️ No OAuth providers are enabled or properly configured');
        this.logProviderStatus();
        this.isInitialized = false;
        return;
      }

      // ✅ CORRECTION 2: Initialisation avec retry et timeout
      await this.initializeSmpAuthOAuthWithRetry();

      const enabledProviders = this.getEnabledProviders();
      this.logger.log(`✅ OAuth service initialized successfully with providers: ${enabledProviders.join(', ')}`);
      
      this.logConfigurationStatus();
      this.isInitialized = true;
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize OAuth service:', error);
      this.logger.warn('⚠️ OAuth service will be disabled due to initialization error');
      this.isInitialized = false;
    }
  }

  /**
   * ✅ CORRECTION 3: Configuration avec URLs corrigées et timeouts
   */
  private async loadAndValidateConfig(): Promise<void> {
    try {
      // ✅ URLs de redirection corrigées
      const authAppUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
      
      this.config = loadOAuthConfig({
        google: {
          clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
          clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
          redirectUri: this.configService.get<string>('GOOGLE_REDIRECT_URI') || 
            `${authAppUrl}/oauth/callback`, // ✅ CORRECTION: Frontend URL
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
            `${authAppUrl}/oauth/callback`, 
          scopes: this.configService.get<string>('GITHUB_SCOPES', 'user:email,read:user').split(','),
          authUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userInfoUrl: 'https://api.github.com/user',
          enabled: this.configService.get<boolean>('GITHUB_OAUTH_ENABLED', false),
          allowSignup: this.configService.get<boolean>('GITHUB_ALLOW_SIGNUP', true),
          organizationId: this.configService.get<string>('GITHUB_ORGANIZATION_ID'),
          timeout: this.TIMEOUTS.NETWORK_TIMEOUT,
          retryAttempts: this.TIMEOUTS.RETRY_ATTEMPTS,
          retryDelay: this.TIMEOUTS.RETRY_DELAY,
        },
        keycloak: {
          brokerCallbackUrl: `${this.configService.get<string>('KEYCLOAK_URL')}/realms/${this.configService.get<string>('KEYCLOAK_REALM')}/broker/{alias}/endpoint`,
          defaultRoles: this.configService.get<string>('OAUTH_DEFAULT_ROLES', 'USER').split(','),
          autoCreateUser: this.configService.get<boolean>('OAUTH_AUTO_CREATE_USER', true),
          syncMode: 'import'
        },
        // network: {
        //   timeout: this.TIMEOUTS.NETWORK_TIMEOUT,
        //   retryAttempts: this.TIMEOUTS.RETRY_ATTEMPTS,
        //   retryDelay: this.TIMEOUTS.RETRY_DELAY,
        //   connectionTimeout: this.TIMEOUTS.CONNECTION_TIMEOUT,
        // }
      });

      const validation = await validateOAuthConfig(this.config);
      
      if (!validation.valid) {
        this.logger.error('❌ OAuth configuration validation failed:', validation.errors);
        throw new Error(`OAuth configuration invalid: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        this.logger.warn('⚠️ OAuth configuration warnings:', validation.warnings);
      }

      this.logger.debug('✅ OAuth configuration loaded and validated successfully');

    } catch (error) {
      this.logger.error('❌ Failed to load OAuth configuration:', error);
      throw error;
    }
  }

  /**
   * ✅ CORRECTION 4: Initialisation avec gestion des timeouts et retry
   */
  private async initializeSmpAuthOAuthWithRetry(): Promise<void> {
    const maxRetries = this.TIMEOUTS.RETRY_ATTEMPTS;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        this.logger.debug(`🔄 Creating OAuth service (attempt ${retryCount + 1}/${maxRetries})`);

        // ✅ Configuration avec timeouts
        const redisConfig = {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          db: this.configService.get<number>('REDIS_DB', 0),
          prefix: this.configService.get<string>('OAUTH_REDIS_PREFIX', 'oauth:'),
          // ✅ AJOUT: Timeouts Redis
          connectTimeout: this.TIMEOUTS.CONNECTION_TIMEOUT,
          commandTimeout: this.TIMEOUTS.NETWORK_TIMEOUT,
        };

        const keycloakConfig = {
          url: this.configService.get<string>('KEYCLOAK_URL', 'http://localhost:8080'),
          realm: this.configService.get<string>('KEYCLOAK_REALM', 'mu-realm'),
          clientId: this.configService.get<string>('KEYCLOAK_CLIENT_ID', 'mu-client'),
          clientSecret: this.configService.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
          adminClientId: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID'),
          adminClientSecret: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET'),
          // ✅ AJOUT: Timeouts Keycloak
          timeout: this.TIMEOUTS.NETWORK_TIMEOUT,
        };

        this.logger.debug('🔄 Creating Redis client for OAuth...');
        const redisClient = createRedisClient(redisConfig);
        
        this.logger.debug('🔄 Creating Keycloak client for OAuth...');
        const keycloakClient = createKeycloakClient(keycloakConfig);

        this.logger.debug('🔄 Creating OAuth service implementation...');
        this.oauthServiceImpl = createOAuthServiceFromEnv(redisClient, keycloakClient);

        // ✅ CORRECTION 5: Test de connectivité avec timeout
        await this.testConnectivityWithTimeout(redisClient);

        this.setupEventHandlers();
        
        this.logger.debug('✅ OAuth service implementation created successfully');
        return;

      } catch (error) {
        retryCount++;
        this.logger.error(`❌ Failed to create OAuth service (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          throw new Error(`Failed to initialize OAuth service after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Attendre avant le prochain essai avec backoff exponentiel
        const delay = this.TIMEOUTS.RETRY_DELAY * Math.pow(2, retryCount - 1);
        this.logger.debug(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * ✅ CORRECTION 6: Test de connectivité avec timeout
   */
  private async testConnectivityWithTimeout(redisClient: any): Promise<void> {
    try {
      this.logger.debug('🧪 Testing Redis connection with timeout...');
      
      const connectivityTest = Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connectivity test timeout')), this.TIMEOUTS.CONNECTION_TIMEOUT)
        )
      ]);
      
      await connectivityTest;
      this.logger.debug('✅ Redis connection test passed');
    } catch (error) {
      this.logger.warn('⚠️ Redis connection test failed, but continuing...', error);
      // Ne pas faire échouer l'initialisation pour Redis
    }
  }

  /**
   * ✅ CORRECTION 7: Méthodes publiques avec gestion des timeouts
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized or no providers configured');
    }
  }

  async getAuthorizationUrl(request: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResponse> {
    this.ensureInitialized();
    
    try {
      // ✅ AJOUT: Timeout pour la génération d'URL
      const urlGeneration = Promise.race([
        this.oauthServiceImpl!.getAuthorizationUrl(request),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OAuth URL generation timeout')), 10000)
        )
      ]);
      
      const result = await urlGeneration;
      
      this.logger.log(`✅ OAuth URL generated for ${request.provider}: ${result.authUrl.substring(0, 100)}...`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ OAuth URL generation failed for ${request.provider}:`, error);
      throw new Error(`Failed to generate OAuth URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async handleCallback(request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> {
    this.ensureInitialized();
    
    try {
      this.logger.log(`🔄 Processing OAuth callback for ${request.provider} with code: ${request.code?.substring(0, 10)}...`);
      
      // ✅ AJOUT: Timeout pour le callback avec retry
      const callbackResult = await this.executeWithRetry(
        () => this.oauthServiceImpl!.handleCallback(request),
        `OAuth callback for ${request.provider}`
      );
      
      if (callbackResult.success) {
        this.logger.log(`✅ OAuth callback successful for ${request.provider}`);
      } else {
        this.logger.error(`❌ OAuth callback failed for ${request.provider}: ${callbackResult.error}`);
      }
      
      return callbackResult;
      
    } catch (error) {
      this.logger.error(`❌ OAuth callback processing failed for ${request.provider}:`, error);
      
      return {
        success: false,
        error: this.getErrorMessage(error),
        message: `OAuth authentication failed for ${request.provider}`
      };
    }
  }

  /**
   * ✅ CORRECTION 8: Exécution avec retry et timeout
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    timeoutMs: number = this.TIMEOUTS.NETWORK_TIMEOUT
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.TIMEOUTS.RETRY_ATTEMPTS; attempt++) {
      try {
        this.logger.debug(`🔄 ${operationName} (attempt ${attempt}/${this.TIMEOUTS.RETRY_ATTEMPTS})`);
        
        const operationWithTimeout = Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`${operationName} timeout after ${timeoutMs}ms`)), timeoutMs)
          )
        ]);
        
        const result = await operationWithTimeout;
        
        if (attempt > 1) {
          this.logger.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        this.logger.warn(`⚠️ ${operationName} failed on attempt ${attempt}: ${lastError.message}`);
        
        if (attempt < this.TIMEOUTS.RETRY_ATTEMPTS) {
          const delay = this.TIMEOUTS.RETRY_DELAY * attempt;
          this.logger.debug(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${this.TIMEOUTS.RETRY_ATTEMPTS} attempts`);
  }

  /**
   * ✅ Autres méthodes avec gestion des timeouts
   */
  async linkAccount(userId: string, provider: string, providerUserId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      return await this.executeWithRetry(
        () => this.oauthServiceImpl!.linkAccount(userId, provider, providerUserId),
        `Link account ${provider} for user ${userId}`
      );
    } catch (error) {
      this.logger.error(`❌ Failed to link ${provider} account for user ${userId}:`, error);
      return false;
    }
  }

  async unlinkAccount(userId: string, provider: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      return await this.executeWithRetry(
        () => this.oauthServiceImpl!.unlinkAccount(userId, provider),
        `Unlink account ${provider} for user ${userId}`
      );
    } catch (error) {
      this.logger.error(`❌ Failed to unlink ${provider} account for user ${userId}:`, error);
      return false;
    }
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    this.ensureInitialized();
    
    try {
      return await this.executeWithRetry(
        () => this.oauthServiceImpl!.getLinkedAccounts(userId),
        `Get linked accounts for user ${userId}`,
        5000 // Timeout plus court pour les lectures
      );
    } catch (error) {
      this.logger.error(`❌ Failed to get linked accounts for user ${userId}:`, error);
      return [];
    }
  }

  async refreshProviderToken(userId: string, provider: string): Promise<OAuthTokenResponse | null> {
    this.ensureInitialized();
    
    try {
      return await this.executeWithRetry(
        () => this.oauthServiceImpl!.refreshProviderToken(userId, provider),
        `Refresh ${provider} token for user ${userId}`
      );
    } catch (error) {
      this.logger.error(`❌ Failed to refresh ${provider} token for user ${userId}:`, error);
      return null;
    }
  }

  // ✅ Méthodes utilitaires
  getEnabledProviders(): string[] {
    if (!this.isInitialized || !this.oauthServiceImpl) {
      return [];
    }
    return this.oauthServiceImpl.getEnabledProviders();
  }

  isProviderEnabled(provider: string): boolean {
    if (!this.isInitialized || !this.oauthServiceImpl) {
      return false;
    }
    return this.oauthServiceImpl.isProviderEnabled(provider);
  }

  async getProviderConfig(provider: string): Promise<any> {
    if (!this.isInitialized || !this.oauthServiceImpl) {
      return null;
    }
    return this.oauthServiceImpl.getProviderConfig(provider);
  }

  /**
   * ✅ Logging amélioré
   */
  private logProviderStatus(): void {
    this.logger.warn('🔧 To enable OAuth:');
    this.logger.warn('   - For Google: Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_ENABLED=true');
    this.logger.warn('   - For GitHub: Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_OAUTH_ENABLED=true');
    this.logger.warn('   - Ensure redirect URIs point to frontend: http://localhost:3000/oauth/callback');
  }

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
      const redirectUri = config?.redirectUri || 'NOT SET';
      
      this.logger.log(`🔍 ${provider.toUpperCase()}: ${status} ${enabled ? 'ENABLED' : 'DISABLED'} ${configured ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
      this.logger.log(`🔍   Redirect URI: ${redirectUri}`);
      
      if (enabled && !configured) {
        this.logger.warn(`⚠️ ${provider.toUpperCase()}: Enabled but missing credentials`);
      }
    }
    
    this.logger.log('🔍 =================================');
  }

  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // ✅ Messages d'erreur spécifiques aux timeouts
      if (message.includes('timeout') || message.includes('etimedout')) {
        return 'Connection timeout. Please check your network connection and try again.';
      }
      
      if (message.includes('network') || message.includes('econnreset') || message.includes('enotfound')) {
        return 'Network connection error. Please check your internet connection.';
      }
      
      if (message.includes('access_denied')) {
        return 'Access denied. Please authorize the application to continue.';
      }
      
      if (message.includes('invalid_grant') || message.includes('expired')) {
        return 'OAuth session expired. Please try again.';
      }
      
      return process.env.NODE_ENV === 'development' ? error.message : 'OAuth authentication failed';
    }
    
    return 'Unknown OAuth error occurred';
  }

  private setupEventHandlers(): void {
    if (!this.oauthServiceImpl) return;

    try {
      this.oauthServiceImpl.addEventListener('oauth_authorization_completed', async (event) => {
        this.logger.log(`🎉 OAuth authorization completed: ${event.provider} - ${event.email}`);
      });

      this.oauthServiceImpl.addEventListener('oauth_authorization_failed', async (event) => {
        this.logger.error(`❌ OAuth authorization failed: ${event.provider} - ${event.error}`);
      });

      this.logger.debug('✅ OAuth event handlers configured');
    } catch (error) {
      this.logger.warn('⚠️ Failed to setup OAuth event handlers:', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('🔄 Destroying OAuth service...');
    
    if (this.oauthServiceImpl) {
      try {
        await this.oauthServiceImpl.close();
        this.logger.log('✅ OAuth service closed successfully');
      } catch (error) {
        this.logger.error('❌ Error closing OAuth service:', error);
      } finally {
        this.oauthServiceImpl = null;
        this.isInitialized = false;
      }
    }
  }
}