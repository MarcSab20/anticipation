// mu-auth/src/auth/services/magic-link-integration.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
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
export interface KeycloakSessionData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  session_id?: string;
}

export interface MagicLinkSessionRequest {
  email: string;
  action: 'login' | 'register' | 'reset_password';
  userId?: string;
  userData?: {
    username: string;
    firstName?: string;
    lastName?: string;
    emailVerified: boolean;
  };
}



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

        const muConfig = this.loadMagicLinkConfig();

        this.validateConfiguration(muConfig);

        await this.initializeClients();

        this.magicLinkService = MagicLinkServiceImpl.createWithMailjet(
        this.redisClient!,
        this.keycloakClient!,
        {
          apiKey: muConfig.mailjet.apiKey,
          apiSecret: muConfig.mailjet.apiSecret,
          fromEmail: muConfig.mailjet.fromEmail,
          fromName: muConfig.mailjet.fromName,
          templates: muConfig.mailjet.templates,
          sandbox: muConfig.mailjet.sandbox
        },
        {
          enabled: muConfig.enabled,
          tokenLength: muConfig.tokenLength,
          expiryMinutes: muConfig.expiryMinutes,
          maxUsesPerDay: muConfig.maxUsesPerDay,
          requireExistingUser: muConfig.requireExistingUser,
          autoCreateUser: muConfig.autoCreateUser
        }
      );
        
        // Configurer les événements
        this.setupEventHandlers();
        
        this.logger.log(`✅ Magic Link service initialized successfully with Twilio`);
        
      } catch (error) {
        this.logger.error('❌ Failed to initialize Magic Link service:', error);
        throw error;
      }
    }

    private validateConfiguration(config: any): void {
    const errors: string[] = [];
    
    if (!config.enabled) {
      this.logger.warn('🔗 Magic Link is disabled');
      return;
    }
    
    // ✅ Validation pour Mailjet
    if (!config.mailjet.apiKey) {
      errors.push('MAILJET_API_KEY is required');
    }
    
    if (!config.mailjet.apiSecret) {
      errors.push('MAILJET_API_SECRET is required');
    }
    
    if (!config.mailjet.fromEmail) {
      errors.push('MAILJET_FROM_EMAIL is required');
    }
    
    if (!config.frontend.baseUrl) {
      errors.push('FRONTEND_URL is required');
    }
    
    // Validation format email
    if (config.mailjet.fromEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(config.mailjet.fromEmail)) {
        errors.push('MAILJET_FROM_EMAIL format is invalid');
      }
    }
    
    // Validation URL frontend
    try {
      new URL(config.frontend.baseUrl);
    } catch {
      errors.push('FRONTEND_URL format is invalid');
    }
    
    if (errors.length > 0) {
      throw new Error(`Magic Link configuration errors: ${errors.join(', ')}`);
    }
  }


    private loadMagicLinkConfig(): any {
    return {
      enabled: this.configService.get('MAGIC_LINK_ENABLED', 'true') !== 'false',
      tokenLength: parseInt(this.configService.get('MAGIC_LINK_TOKEN_LENGTH', '32')),
      expiryMinutes: parseInt(this.configService.get('MAGIC_LINK_EXPIRY_MINUTES', '30')),
      maxUsesPerDay: parseInt(this.configService.get('MAGIC_LINK_MAX_USES_PER_DAY', '10')),
      requireExistingUser: this.configService.get('MAGIC_LINK_REQUIRE_EXISTING_USER', 'false') === 'true',
      autoCreateUser: this.configService.get('MAGIC_LINK_AUTO_CREATE_USER', 'true') !== 'false',
      
      mailjet: {
        apiKey: this.configService.get('MAILJET_API_KEY', ''),
        apiSecret: this.configService.get('MAILJET_API_SECRET', ''),
        fromEmail: this.configService.get('MAILJET_FROM_EMAIL', ''),
        fromName: this.configService.get('FROM_NAME', 'SMP Platform'),
        templates: {
          magicLink: this.configService.get('MAILJET_TEMPLATE_MAGIC_LINK', ''),
          welcome: this.configService.get('MAILJET_TEMPLATE_WELCOME', ''),
          passwordReset: this.configService.get('MAILJET_TEMPLATE_PASSWORD_RESET', ''),
          mfaCode: this.configService.get('MAILJET_TEMPLATE_MFA_CODE', '')
        },
        sandbox: this.configService.get('NODE_ENV') !== 'production'
      },
      
      frontend: {
        baseUrl: this.configService.get('FRONTEND_URL', 'http://localhost:3001'),
        magicLinkPath: this.configService.get('MAGIC_LINK_PATH', '/auth/magic-link'),
        redirectPaths: {
          login: this.configService.get('REDIRECT_LOGIN', '/dashboard'),
          register: this.configService.get('REDIRECT_REGISTER', '/welcome'),
          resetPassword: this.configService.get('REDIRECT_RESET_PASSWORD', '/auth/password-reset'),
          verifyEmail: this.configService.get('REDIRECT_VERIFY_EMAIL', '/auth/email-verified')
        }
      },
      backend: {
      baseUrl: this.configService.get('BACKEND_URL', 'http://localhost:3001'),
      magicLinkVerifyPath: '/auth/magic-link/verify'
    }
    };
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
            type: 'login', // Mapper vers un type compatible
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
        const result = await this.magicLinkService!.generateMagicLink(magicLinkRequest);
        
        this.logger.log(`🔗 Magic link ${result.success ? 'generated' : 'failed'} for ${request.email}`);
        
        return result;
        
      } catch (error) {
        this.logger.error(`❌ Failed to generate magic link for ${request.email}:`, error);
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

    // ============================================================================
    // MÉTHODES POUR L'AUTHENTIFICATION PASSWORDLESS
    // ============================================================================

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

    isEnabled(): boolean {
      return this.magicLinkService !== null;
    }

    private ensureServiceInitialized(): void {
      if (!this.magicLinkService) {
        throw new Error('Magic Link service is not initialized. Check configuration and dependencies.');
      }
    }

    /**
   * Nouvelle méthode pour récupérer les Magic Links par email
   */
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

  /**
   * Vérifier un Magic Link avec logging détaillé
   */
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

  /**
   * Nettoyer les liens expirés avec rapport
   */
  async cleanupExpiredLinksWithReport(): Promise<{
    cleaned: number;
    remaining: number;
    report: string[];
  }> {
    if (!this.magicLinkService) {
      throw new Error('Magic Link service not initialized');
    }

    const report: string[] = [];
    const cleaned = await this.magicLinkService.cleanupExpiredLinks();
    
    report.push(`🧹 Cleanup completed: ${cleaned} expired links removed`);
    
    // Optionnel: compter les liens restants
    // const remaining = await this.countActiveMagicLinks();
    const remaining = 0; // Placeholder
    
    report.push(`📊 Active links remaining: ${remaining}`);

    return { cleaned, remaining, report };
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