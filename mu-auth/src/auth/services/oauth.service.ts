// mu-auth/src/auth/services/oauth.service.ts - VERSION CORRIGÉE avec gestion améliorée des timeouts
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

  // ✅ CONFIGURATION DES TIMEOUTS OPTIMISÉE
  private readonly TIMEOUTS = {
    NETWORK_TIMEOUT: 60000,        
    RETRY_ATTEMPTS: 3,             
    RETRY_DELAY: 3000,             
    CONNECTION_TIMEOUT: 30000,     
    OAUTH_STATE_TTL: 600,          
    OAUTH_CALLBACK_TIMEOUT: 90000, 
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
      this.logger.log('🔄 Initializing OAuth service with enhanced error handling...');
      
      // ✅ CORRECTION 1: Configuration avec validation précoce
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

      // ✅ CORRECTION 2: Initialisation avec meilleure gestion d'erreurs
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
   * ✅ CORRECTION 3: Configuration avec URLs et timeouts améliorés
   */
  private async loadAndValidateConfig(): Promise<void> {
    try {
      // ✅ URLs de redirection corrigées avec détection d'environnement
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      const authAppUrl = this.configService.get<string>('FRONTEND_URL') || 
        (nodeEnv === 'production' ? 'https://your-domain.com' : 'http://localhost:3000');
      const apiUrl = this.configService.get<string>('API_URL') || 
        (nodeEnv === 'production' ? 'https://api.your-domain.com' : 'http://localhost:3001');
      
      this.logger.log(`🔍 Using environment: ${nodeEnv}`);
      this.logger.log(`🔍 Frontend URL: ${authAppUrl}`);
      this.logger.log(`🔍 API URL: ${apiUrl}`);
      
      this.config = loadOAuthConfig({
        google: {
          clientId: this.configService.get<string>('GOOGLE_CLIENT_ID', ''),
          clientSecret: this.configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
          redirectUri: this.configService.get<string>('GOOGLE_REDIRECT_URI') || 
            `${authAppUrl}/oauth/callback`, // ✅ CORRECTION: Utiliser le frontend, pas l'API
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
            `${authAppUrl}/oauth/callback`, // ✅ CORRECTION: Utiliser le frontend
          scopes: this.configService.get<string>('GITHUB_SCOPES', 'user:email,read:user').split(','),
          authUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userInfoUrl: 'https://api.github.com/user',
          enabled: this.configService.get<boolean>('GITHUB_OAUTH_ENABLED', false),
          allowSignup: this.configService.get<boolean>('GITHUB_ALLOW_SIGNUP', true),
          organizationId: this.configService.get<string>('GITHUB_ORGANIZATION_ID'),
          // ✅ CORRECTION 4: Timeouts spécifiques à GitHub
          timeout: this.TIMEOUTS.NETWORK_TIMEOUT,
          retryAttempts: this.TIMEOUTS.RETRY_ATTEMPTS,
          retryDelay: this.TIMEOUTS.RETRY_DELAY,
        },
        keycloak: {
          brokerCallbackUrl: `${this.configService.get<string>('KEYCLOAK_URL')}/realms/${this.configService.get<string>('KEYCLOAK_REALM')}/broker/{alias}/endpoint`,
          defaultRoles: this.configService.get<string>('OAUTH_DEFAULT_ROLES', 'USER').split(','),
          autoCreateUser: this.configService.get<boolean>('OAUTH_AUTO_CREATE_USER', true),
          syncMode: 'import'
        }
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
   * ✅ CORRECTION 5: Initialisation avec gestion robuste des erreurs
   */
  private async initializeSmpAuthOAuthWithRetry(): Promise<void> {
    const maxRetries = this.TIMEOUTS.RETRY_ATTEMPTS;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        this.logger.debug(`🔄 Creating OAuth service (attempt ${retryCount + 1}/${maxRetries})`);

        // ✅ Configuration avec timeouts et validation de connectivité
        const redisConfig = {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          db: this.configService.get<number>('REDIS_DB', 0),
          prefix: this.configService.get<string>('OAUTH_REDIS_PREFIX', 'oauth:'),
          // ✅ AJOUT: Timeouts Redis optimisés
          connectTimeout: this.TIMEOUTS.CONNECTION_TIMEOUT,
          commandTimeout: this.TIMEOUTS.NETWORK_TIMEOUT,
          retryDelayOnFailover: this.TIMEOUTS.RETRY_DELAY,
          maxRetriesPerRequest: 2,
        };

        const keycloakConfig = {
          url: this.configService.get<string>('KEYCLOAK_URL', 'http://localhost:8080'),
          realm: this.configService.get<string>('KEYCLOAK_REALM', 'mu-realm'),
          clientId: this.configService.get<string>('KEYCLOAK_CLIENT_ID', 'mu-client'),
          clientSecret: this.configService.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
          adminClientId: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID'),
          adminClientSecret: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET'),
          // ✅ AJOUT: Timeouts Keycloak optimisés
          timeout: this.TIMEOUTS.NETWORK_TIMEOUT,
          retryAttempts: 2,
          retryDelay: this.TIMEOUTS.RETRY_DELAY,
        };

        this.logger.debug('🔄 Creating Redis client for OAuth...');
        const redisClient = createRedisClient(redisConfig);
        
        this.logger.debug('🔄 Creating Keycloak client for OAuth...');
        const keycloakClient = createKeycloakClient(keycloakConfig);

        this.logger.debug('🔄 Creating OAuth service implementation...');
        this.oauthServiceImpl = createOAuthServiceFromEnv(redisClient, keycloakClient);

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
   * ✅ CORRECTION 8: Méthodes publiques avec timeouts et retry
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.oauthServiceImpl) {
      throw new Error('OAuth service not initialized or no providers configured');
    }
  }

  async getAuthorizationUrl(request: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResponse> {
    this.ensureInitialized();
    
    try {
      // ✅ AJOUT: Timeout plus court pour la génération d'URL (opération locale)
      const urlGeneration = Promise.race([
        this.oauthServiceImpl!.getAuthorizationUrl(request),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('OAuth URL generation timeout')), 15000)
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
      
      // ✅ CORRECTION 9: Timeout plus long pour le callback (opération réseau complexe)
      const callbackResult = await this.executeWithRetry(
        () => this.oauthServiceImpl!.handleCallback(request),
        `OAuth callback for ${request.provider}`,
        this.TIMEOUTS.OAUTH_CALLBACK_TIMEOUT // Timeout spécial pour callback
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
   * ✅ CORRECTION 10: Exécution avec retry et timeout améliorés
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
        
        // ✅ FIX: Timeout adaptatif basé sur le nombre de tentatives
        const adaptiveTimeout = timeoutMs + ((attempt - 1) * 15000); // +15s par tentative
        
        const operationWithTimeout = Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`${operationName} timeout after ${adaptiveTimeout}ms`)), adaptiveTimeout)
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
        
        // ✅ FIX: Vérifier si l'erreur est retryable
        const isRetryable = this.isErrorRetryable(lastError);
        
        if (!isRetryable || attempt >= this.TIMEOUTS.RETRY_ATTEMPTS) {
          this.logger.error(`❌ ${operationName} failed definitively: ${lastError.message} (retryable: ${isRetryable})`);
          break;
        }
        
        if (attempt < this.TIMEOUTS.RETRY_ATTEMPTS) {
          const delay = this.TIMEOUTS.RETRY_DELAY * Math.pow(2, attempt - 1); // Backoff exponentiel
          this.logger.debug(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${this.TIMEOUTS.RETRY_ATTEMPTS} attempts`);
  }

  /**
   * ✅ CORRECTION 11: Détection d'erreurs retryables améliorée
   */
  private isErrorRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Erreurs de réseau retryables
    const retryablePatterns = [
      'timeout',
      'etimedout', 
      'econnrefused',
      'econnreset',
      'enotfound',
      'ehostunreach',
      'socket hang up',
      'network error',
      'connection refused',
      'request timeout to github api',
      'github api server error',
      'rate limit'
    ];
    
    const isRetryable = retryablePatterns.some(pattern => message.includes(pattern));
    
    this.logger.debug(`🔍 Error retryability check: "${error.message}" -> ${isRetryable}`);
    
    return isRetryable;
  }

  /**
   * ✅ Autres méthodes avec gestion des timeouts
   */
  async linkAccount(userId: string, provider: string, providerUserId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      return await this.executeWithRetry(
        () => this.oauthServiceImpl!.linkAccount(userId, provider, providerUserId),
        `Link account ${provider} for user ${userId}`,
        10000 // Timeout plus court pour les opérations de DB
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
        `Unlink account ${provider} for user ${userId}`,
        10000
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
        15000 // Timeout plus court pour les lectures
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
        `Refresh ${provider} token for user ${userId}`,
        this.TIMEOUTS.NETWORK_TIMEOUT
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
   * ✅ Logging et debugging améliorés
   */
  private logProviderStatus(): void {
    this.logger.warn('🔧 To enable OAuth providers:');
    this.logger.warn('   - For Google: Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_ENABLED=true');
    this.logger.warn('   - For GitHub: Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_OAUTH_ENABLED=true');
    this.logger.warn('   - Ensure redirect URIs point to frontend (not API)');
    this.logger.warn('   - Example redirect URI: http://localhost:3000/oauth/callback');
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
      this.logger.log(`🔍   Client ID: ${config?.clientId ? `${config.clientId.substring(0, 10)}...` : 'NOT SET'}`);
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
      
      // ✅ Messages d'erreur spécifiques aux timeouts et réseau
      if (message.includes('timeout') || message.includes('etimedout')) {
        return 'Connection timeout. This may be due to network issues or GitHub API being slow. Please try again.';
      }
      
      if (message.includes('network') || message.includes('econnreset') || message.includes('enotfound')) {
        return 'Network connection error. Please check your internet connection and try again.';
      }
      
      if (message.includes('access_denied')) {
        return 'Access denied. Please authorize the application to continue.';
      }
      
      if (message.includes('invalid_grant') || message.includes('expired')) {
        return 'OAuth session expired. Please try again.';
      }
      
      if (message.includes('github oauth error')) {
        return error.message; // Garder le message spécifique GitHub
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