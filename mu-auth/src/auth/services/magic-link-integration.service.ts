// mu-auth/src/auth/services/magic-link-integration.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  MagicLinkServiceImpl,
  createRedisClient,
  createKeycloakClient,
  RedisClient,
  KeycloakClient,
  MagicLinkRequest,
  MagicLinkResult,
  MagicLinkVerificationResult,
  AuthResponse
} from 'smp-auth-ts';

import { EventLoggerService } from './event-logger.service';

@Injectable()
export class MagicLinkIntegrationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MagicLinkIntegrationService.name);
  private magicLinkService: MagicLinkServiceImpl | null = null;
  private redisClient: RedisClient | null = null;
  private keycloakClient: KeycloakClient | null = null;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly eventLogger: EventLoggerService
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('🔗 Initializing Magic Link service...');

      // ✅ CORRECTION 1: Debug exhaustif des variables
      this.debugEnvironmentVariables();

      const muConfig = this.loadMagicLinkConfig();

      // ✅ CORRECTION 2: Validation avant initialisation
      this.validateConfiguration(muConfig);

      await this.initializeClients();

      // ✅ CORRECTION 3: Configuration explicite avec valeurs forcées
      this.logger.log('🔧 Creating MagicLinkService with explicit configuration:');
      
      // Force la création avec des valeurs directes depuis ConfigService
      const explicitMailjetConfig = {
        apiKey: this.configService.get<string>('MAILJET_API_KEY')!,
        apiSecret: this.configService.get<string>('MAILJET_API_SECRET')!,
        fromEmail: this.configService.get<string>('MAILJET_FROM_EMAIL')!,
        fromName: this.configService.get('FROM_NAME', 'SMP Platform'),
        templates: {
          magicLink: this.configService.get('MAILJET_TEMPLATE_MAGIC_LINK', ''),
          welcome: this.configService.get('MAILJET_TEMPLATE_WELCOME', ''),
          passwordReset: this.configService.get('MAILJET_TEMPLATE_PASSWORD_RESET', ''),
          mfaCode: this.configService.get('MAILJET_TEMPLATE_MFA_CODE', '')
        },
        sandbox: this.configService.get('NODE_ENV') !== 'production'
      };

      // ✅ CORRECTION 4: Log de vérification finale
      this.logger.log('🔧 Final Mailjet config before service creation:', {
        hasApiKey: !!explicitMailjetConfig.apiKey,
        hasApiSecret: !!explicitMailjetConfig.apiSecret,
        hasFromEmail: !!explicitMailjetConfig.fromEmail,
        apiKeyLength: explicitMailjetConfig.apiKey?.length || 0,
        apiSecretLength: explicitMailjetConfig.apiSecret?.length || 0,
        fromEmail: explicitMailjetConfig.fromEmail,
        fromName: explicitMailjetConfig.fromName,
        sandbox: explicitMailjetConfig.sandbox
      });

      // ✅ VÉRIFICATION FINALE AVANT CRÉATION
      if (!explicitMailjetConfig.apiKey || explicitMailjetConfig.apiKey.length === 0) {
        throw new Error(`CRITICAL: MAILJET_API_KEY is empty. Value: "${explicitMailjetConfig.apiKey}"`);
      }

      if (!explicitMailjetConfig.apiSecret || explicitMailjetConfig.apiSecret.length === 0) {
        throw new Error(`CRITICAL: MAILJET_API_SECRET is empty. Value: "${explicitMailjetConfig.apiSecret}"`);
      }

      if (!explicitMailjetConfig.fromEmail || explicitMailjetConfig.fromEmail.length === 0) {
        throw new Error(`CRITICAL: MAILJET_FROM_EMAIL is empty. Value: "${explicitMailjetConfig.fromEmail}"`);
      }

      // Créer le service avec configuration explicite
      this.magicLinkService = MagicLinkServiceImpl.createWithMailjet(
        this.redisClient!,
        this.keycloakClient!,
        explicitMailjetConfig,
        {
          enabled: this.configService.get('MAGIC_LINK_ENABLED', 'true') !== 'false',
          tokenLength: parseInt(this.configService.get('MAGIC_LINK_TOKEN_LENGTH', '32')),
          expiryMinutes: parseInt(this.configService.get('MAGIC_LINK_EXPIRY_MINUTES', '30')),
          maxUsesPerDay: parseInt(this.configService.get('MAGIC_LINK_MAX_USES_PER_DAY', '10')),
          requireExistingUser: this.configService.get('MAGIC_LINK_REQUIRE_EXISTING_USER', 'false') === 'true',
          autoCreateUser: this.configService.get('MAGIC_LINK_AUTO_CREATE_USER', 'true') !== 'false'
        }
      );

      this.logger.log('🔧 MagicLinkService created successfully');
      
      // Configurer les événements
      this.setupEventHandlers();
      
      this.logger.log(`✅ Magic Link service initialized successfully with MailJet`);
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize Magic Link service:', error);
      this.logger.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // ✅ CORRECTION 5: Debug exhaustif avec process.env direct
  private debugEnvironmentVariables(): void {
    this.logger.log('🔍 =================================');
    this.logger.log('🔍 VARIABLES D\'ENVIRONNEMENT MAILJET');
    this.logger.log('🔍 =================================');
    
    // Variables critiques avec debug complet
    const criticalVars = [
      'MAILJET_API_KEY',
      'MAILJET_API_SECRET', 
      'MAILJET_FROM_EMAIL',
      'EMAIL_PROVIDER',
      'MAGIC_LINK_ENABLED'
    ];

    criticalVars.forEach(varName => {
      const processEnvValue = process.env[varName];
      const configServiceValue = this.configService.get(varName);
      
      this.logger.log(`🔍 ${varName}:`);
      this.logger.log(`  📋 process.env[${varName}]: ${processEnvValue ? '✅ SET' : '❌ UNDEFINED'}`);
      this.logger.log(`  📋 process.env value: "${processEnvValue}"`);
      this.logger.log(`  📋 process.env type: ${typeof processEnvValue}`);
      this.logger.log(`  📋 process.env length: ${processEnvValue?.length || 0}`);
      
      this.logger.log(`  🔧 ConfigService.get(${varName}): ${configServiceValue ? '✅ SET' : '❌ UNDEFINED'}`);
      this.logger.log(`  🔧 ConfigService value: "${configServiceValue}"`);
      this.logger.log(`  🔧 ConfigService type: ${typeof configServiceValue}`);
      this.logger.log(`  🔧 ConfigService length: ${configServiceValue?.length || 0}`);
      
      // Vérification de cohérence
      if (processEnvValue !== configServiceValue) {
        this.logger.warn(`  ⚠️ MISMATCH entre process.env et ConfigService pour ${varName}!`);
        this.logger.warn(`  ⚠️ process.env: "${processEnvValue}"`);
        this.logger.warn(`  ⚠️ ConfigService: "${configServiceValue}"`);
      }
    });

    this.logger.log(`🔍 NODE_ENV: ${process.env.NODE_ENV}`);
    this.logger.log(`🔍 Config files: .env.${process.env.NODE_ENV || 'local'}, .env.local, .env`);
    this.logger.log('🔍 =================================');
  }

  // ✅ CORRECTION 6: Configuration avec récupération directe
  private loadMagicLinkConfig(): any {
    this.logger.log('📋 Loading Magic Link configuration...');

    // ✅ Récupération directe avec fallback
    const getConfigValue = (key: string, defaultValue?: string): string => {
      // Essayer ConfigService en premier
      let value = this.configService.get<string>(key);
      
      // Si pas de valeur, essayer process.env directement
      if (!value || value.trim() === '') {
        value = process.env[key];
      }
      
      // Si toujours pas de valeur, utiliser la valeur par défaut
      if (!value || value.trim() === '') {
        value = defaultValue || '';
      }
      
      this.logger.log(`📋 ${key}: ConfigService="${this.configService.get(key)}" | process.env="${process.env[key]}" | final="${value}"`);
      
      return value;
    };

    const config = {
      enabled: getConfigValue('MAGIC_LINK_ENABLED', 'true') !== 'false',
      tokenLength: parseInt(getConfigValue('MAGIC_LINK_TOKEN_LENGTH', '32')),
      expiryMinutes: parseInt(getConfigValue('MAGIC_LINK_EXPIRY_MINUTES', '30')),
      maxUsesPerDay: parseInt(getConfigValue('MAGIC_LINK_MAX_USES_PER_DAY', '10')),
      requireExistingUser: getConfigValue('MAGIC_LINK_REQUIRE_EXISTING_USER', 'false') === 'true',
      autoCreateUser: getConfigValue('MAGIC_LINK_AUTO_CREATE_USER', 'true') !== 'false',
      
      mailjet: {
        apiKey: getConfigValue('MAILJET_API_KEY'),
        apiSecret: getConfigValue('MAILJET_API_SECRET'),
        fromEmail: getConfigValue('MAILJET_FROM_EMAIL'),
        fromName: getConfigValue('FROM_NAME', 'SMP Platform'),
        templates: {
          magicLink: getConfigValue('MAILJET_TEMPLATE_MAGIC_LINK', ''),
          welcome: getConfigValue('MAILJET_TEMPLATE_WELCOME', ''),
          passwordReset: getConfigValue('MAILJET_TEMPLATE_PASSWORD_RESET', ''),
          mfaCode: getConfigValue('MAILJET_TEMPLATE_MFA_CODE', '')
        },
        sandbox: getConfigValue('NODE_ENV') !== 'production'
      },
      
      frontend: {
        baseUrl: getConfigValue('FRONTEND_URL', 'http://localhost:3000'),
        magicLinkPath: getConfigValue('MAGIC_LINK_PATH', '/auth/magic-link'),
        redirectPaths: {
          login: getConfigValue('REDIRECT_LOGIN', '/dashboard'),
          register: getConfigValue('REDIRECT_REGISTER', '/welcome'),
          resetPassword: getConfigValue('REDIRECT_RESET_PASSWORD', '/auth/password-reset'),
          verifyEmail: getConfigValue('REDIRECT_VERIFY_EMAIL', '/auth/email-verified')
        }
      },
      backend: {
        baseUrl: getConfigValue('BACKEND_URL', 'http://localhost:3001'),
        magicLinkVerifyPath: '/auth/magic-link/verify'
      }
    };

    // Log de la configuration finale
    this.logger.log('📋 Configuration loaded:', {
      enabled: config.enabled,
      hasApiKey: !!config.mailjet.apiKey,
      hasApiSecret: !!config.mailjet.apiSecret,
      fromEmail: config.mailjet.fromEmail,
      apiKeyPreview: config.mailjet.apiKey ? `${config.mailjet.apiKey.substring(0, 8)}...` : 'EMPTY',
      apiSecretPreview: config.mailjet.apiSecret ? `${config.mailjet.apiSecret.substring(0, 8)}...` : 'EMPTY'
    });

    return config;
  }

  // ✅ CORRECTION 7: Validation avec messages détaillés
  private validateConfiguration(config: any): void {
    const errors: string[] = [];
    
    if (!config.enabled) {
      this.logger.warn('🔗 Magic Link is disabled');
      return;
    }
    
    this.logger.log('🔍 Validating Mailjet configuration...');
    
    // Validation stricte
    if (!config.mailjet.apiKey) {
      errors.push('MAILJET_API_KEY is missing');
      this.logger.error('❌ MAILJET_API_KEY is missing');
    } else if (typeof config.mailjet.apiKey !== 'string') {
      errors.push(`MAILJET_API_KEY must be a string, got ${typeof config.mailjet.apiKey}`);
      this.logger.error(`❌ MAILJET_API_KEY type error: ${typeof config.mailjet.apiKey}`);
    } else if (config.mailjet.apiKey.trim() === '') {
      errors.push('MAILJET_API_KEY is empty');
      this.logger.error('❌ MAILJET_API_KEY is empty string');
    } else {
      this.logger.log(`✅ MAILJET_API_KEY valid: ${config.mailjet.apiKey.substring(0, 8)}...`);
    }
    
    if (!config.mailjet.apiSecret) {
      errors.push('MAILJET_API_SECRET is missing');
      this.logger.error('❌ MAILJET_API_SECRET is missing');
    } else if (typeof config.mailjet.apiSecret !== 'string') {
      errors.push(`MAILJET_API_SECRET must be a string, got ${typeof config.mailjet.apiSecret}`);
      this.logger.error(`❌ MAILJET_API_SECRET type error: ${typeof config.mailjet.apiSecret}`);
    } else if (config.mailjet.apiSecret.trim() === '') {
      errors.push('MAILJET_API_SECRET is empty');
      this.logger.error('❌ MAILJET_API_SECRET is empty string');
    } else {
      this.logger.log(`✅ MAILJET_API_SECRET valid: ${config.mailjet.apiSecret.substring(0, 8)}...`);
    }
    
    if (!config.mailjet.fromEmail) {
      errors.push('MAILJET_FROM_EMAIL is missing');
      this.logger.error('❌ MAILJET_FROM_EMAIL is missing');
    } else if (typeof config.mailjet.fromEmail !== 'string') {
      errors.push(`MAILJET_FROM_EMAIL must be a string, got ${typeof config.mailjet.fromEmail}`);
      this.logger.error(`❌ MAILJET_FROM_EMAIL type error: ${typeof config.mailjet.fromEmail}`);
    } else if (config.mailjet.fromEmail.trim() === '') {
      errors.push('MAILJET_FROM_EMAIL is empty');
      this.logger.error('❌ MAILJET_FROM_EMAIL is empty string');
    } else {
      // Validation format email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(config.mailjet.fromEmail)) {
        errors.push('MAILJET_FROM_EMAIL format is invalid');
        this.logger.error(`❌ MAILJET_FROM_EMAIL format invalide: ${config.mailjet.fromEmail}`);
      } else {
        this.logger.log(`✅ MAILJET_FROM_EMAIL valid: ${config.mailjet.fromEmail}`);
      }
    }
    
    if (!config.frontend.baseUrl) {
      errors.push('FRONTEND_URL is required');
    }
    
    if (errors.length > 0) {
      this.logger.error('❌ Configuration validation failed:', errors);
      throw new Error(`Magic Link configuration errors: ${errors.join(', ')}`);
    }
    
    this.logger.log('✅ Configuration Mailjet validée avec succès');
  }

  private async initializeClients(): Promise<void> {
    try {
      // Configuration Redis
      const redisConfig = {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB', 0),
        prefix: this.configService.get('REDIS_PREFIX', 'mu:auth:') + 'magic:',
        connectTimeout: 10000,
        commandTimeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000
      };
      
      this.redisClient = createRedisClient(redisConfig);
      
      // Configuration Keycloak
      const keycloakConfig = {
        url: this.configService.get('KEYCLOAK_URL', 'http://localhost:8080'),
        realm: this.configService.get('KEYCLOAK_REALM', 'mu-realm'),
        clientId: this.configService.get('KEYCLOAK_CLIENT_ID', 'mu-client'),
        clientSecret: this.configService.get('KEYCLOAK_CLIENT_SECRET', ''),
        timeout: this.configService.get('KEYCLOAK_TIMEOUT', 10000),
        adminClientId: this.configService.get('KEYCLOAK_ADMIN_CLIENT_ID'),
        adminClientSecret: this.configService.get('KEYCLOAK_ADMIN_CLIENT_SECRET'),
        enableCache: true,
        cacheExpiry: 3600
      };
      
      this.keycloakClient = createKeycloakClient(keycloakConfig);
      
      this.logger.log('✅ Redis and Keycloak clients initialized');
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize clients:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.magicLinkService) return;
    
    try {
      // Écouter les événements Magic Link
      this.magicLinkService.addEventListener('magic_link_generated', async (event) => {
        await this.eventLogger.logEvent({
          type: 'login',
          userId: event.userId,
          success: true,
          details: {
            action: 'magic_link_generated',
            email: event.data.email,
            linkAction: event.data.action,
            emailSent: event.data.emailSent,
            correlationId: event.data.correlationId
          }
        });
        
        this.logger.debug(`🔗 Magic link generated for ${event.data.email}`);
      });
      
      this.magicLinkService.addEventListener('magic_link_used', async (event) => {
        await this.eventLogger.logEvent({
          type: 'login',
          userId: event.userId,
          success: event.data.success,
          details: {
            action: 'magic_link_used',
            email: event.data.email,
            linkAction: event.data.action,
            correlationId: event.data.correlationId
          }
        });
        
        this.logger.debug(`🔗 Magic link used by ${event.data.email}`);
      });
      
      this.logger.log('✅ Magic Link event handlers configured');
      
    } catch (error) {
      this.logger.warn('⚠️ Failed to setup event handlers:', error);
    }
  }

  // ============================================================================
  // MÉTHODES PUBLIQUES POUR MAGIC LINK
  // ============================================================================

  async generateMagicLink(request: {
    email: string;
    action?: 'login' | 'register' | 'reset_password' | 'verify_email';
    redirectUrl?: string;
    context?: {
      ip?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      referrer?: string;
    };
  }): Promise<MagicLinkResult> {
    this.ensureServiceInitialized();
    
    const magicLinkRequest: MagicLinkRequest = {
      email: request.email,
      redirectUrl: request.redirectUrl,
      context: {
        ...request.context,
        action: request.action || 'login'
      }
    };
    
    try {
      this.logger.log(`🔗 Generating magic link for ${request.email}, action: ${request.action || 'login'}`);
      
      const result = await this.magicLinkService!.generateMagicLink(magicLinkRequest);
      
      this.logger.log(`🔗 Magic link ${result.success ? 'generated' : 'failed'} for ${request.email}`);
      
      // Log détaillé du résultat
      if (result.success) {
        this.logger.log(`✅ Magic link generated successfully:`, {
          linkId: result.linkId,
          emailSent: result.emailSent,
          expiresAt: result.expiresAt
        });
      } else {
        this.logger.error(`❌ Magic link generation failed:`, {
          message: result.message,
          email: request.email
        });
      }
      
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Failed to generate magic link for ${request.email}:`, error);
      throw error;
    }
  }

  async verifyMagicLink(token: string): Promise<any> {
    if (!this.magicLinkService) {
      throw new Error('Magic Link service not initialized');
    }

    this.logger.log(`🔍 Verifying Magic Link token: ${token.substring(0, 8)}...`);

    try {
      const result = await this.magicLinkService.verifyMagicLink(token);
      
      this.logger.log(`✅ Magic Link verification result:`, {
        success: result.success,
        status: result.status,
        hasAuthResponse: !!result.authResponse,
        requiresMFA: result.requiresMFA,
        hasUserInfo: !!result.userInfo
      });

      return result;
    } catch (error) {
      this.logger.error(`❌ Magic Link verification error:`, error);
      throw error;
    }
  }

  async revokeMagicLink(linkId: string): Promise<void> {
    this.ensureServiceInitialized();
    
    try {
      await this.magicLinkService!.revokeMagicLink(linkId);
      this.logger.log(`🔗 Magic link revoked: ${linkId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to revoke magic link ${linkId}:`, error);
      throw error;
    }
  }

  async cleanupExpiredLinks(): Promise<number> {
    this.ensureServiceInitialized();
    
    try {
      const cleaned = await this.magicLinkService!.cleanupExpiredLinks();
      this.logger.log(`🧹 Cleaned up ${cleaned} expired magic links`);
      return cleaned;
    } catch (error) {
      this.logger.error('❌ Failed to cleanup expired links:', error);
      return 0;
    }
  }

  async initiatePasswordlessAuth(request: {
    email: string;
    action?: 'login' | 'register';
    redirectUrl?: string;
    context?: {
      ip?: string;
      userAgent?: string;
      deviceFingerprint?: string;
    };
  }) {
    this.ensureServiceInitialized();
    
    try {
      const result = await this.magicLinkService!.initiatePasswordlessAuth({
        identifier: request.email,
        method: 'magic_link',
        action: request.action || 'login',
        redirectUrl: request.redirectUrl,
        context: request.context
      });
      
      this.logger.log(`🔗 Passwordless auth initiated for ${request.email}`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Failed to initiate passwordless auth for ${request.email}:`, error);
      throw error;
    }
  }

  async getMagicLinksByEmail(email: string): Promise<any[]> {
    if (!this.magicLinkService) {
      throw new Error('Magic Link service not initialized');
    }

    try {
      return await this.magicLinkService.getUserMagicLinks(email);
    } catch (error) {
      this.logger.error(`Failed to get magic links for ${email}:`, error);
      return [];
    }
  }

  isEnabled(): boolean {
    return this.magicLinkService !== null;
  }

  private ensureServiceInitialized(): void {
    if (!this.magicLinkService) {
      throw new Error('Magic Link service is not initialized. Check configuration and dependencies.');
    }
  }

  async onModuleDestroy() {
    try {
      if (this.redisClient) {
        await this.redisClient.close();
      }
      if (this.keycloakClient) {
        await this.keycloakClient.close();
      }
      this.logger.log('🔗 Magic Link service destroyed');
    } catch (error) {
      this.logger.error('Error destroying Magic Link service:', error);
    }
  }
}