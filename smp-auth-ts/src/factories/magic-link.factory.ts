import { MagicLinkServiceImpl } from '../services/magic-link.service.js';
import { MagicLinkConfigImpl } from '../config/magic-link.config.js';
import { RedisClient } from '../interface/redis.interface.js';
import { KeycloakClient } from '../interface/auth.interface.js';

export interface MagicLinkFactoryConfig {
  magicLink?: {
    enabled?: boolean;
    tokenLength?: number;
    expiryMinutes?: number;
    maxUsesPerDay?: number;
    requireExistingUser?: boolean;
    autoCreateUser?: boolean;
  };

  email: {
    provider: 'mailjet'; 
    mailjet: { 
      apiKey: string;
      apiSecret: string;
      fromEmail: string;
      fromName?: string;
      templates?: {
        magicLink?: string;
        welcome?: string;
        passwordReset?: string;
        mfaCode?: string;
      };
      sandbox?: boolean;
    };
  };

  frontend?: {
    baseUrl?: string;
    magicLinkPath?: string;
    redirectPaths?: {
      login?: string;
      register?: string;
      resetPassword?: string;
      verifyEmail?: string;
    };
  };
}

export class MagicLinkFactory {

  static createWithMailjet(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config: MagicLinkFactoryConfig
  ): MagicLinkServiceImpl {
    
    console.log('🏭 Creating Magic Link service with Mailjet...');
    
    this.validateMailjetConfig(config);
    const fullConfig: MagicLinkConfigImpl = this.buildFullConfigForMailjet(config);
    
    const service = new MagicLinkServiceImpl(
      redisClient,
      keycloakClient,
      fullConfig
    );

    console.log('✅ Magic Link service created successfully with Mailjet');
    return service;
  }

  static create(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config: MagicLinkFactoryConfig
  ): MagicLinkServiceImpl {
    
    switch (config.email.provider) {      
      case 'mailjet':
        return this.createWithMailjet(redisClient, keycloakClient, config);
      
      default:
        throw new Error(`Unsupported email provider: ${config.email.provider}`);
    }
  }

  static createFromEnvironment(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient
  ): MagicLinkServiceImpl {
    
    const provider = process.env.EMAIL_PROVIDER;
    
    if (provider === 'mailjet') {
      const config: MagicLinkFactoryConfig = {
        magicLink: {
          enabled: process.env.MAGIC_LINK_ENABLED !== 'false',
          tokenLength: parseInt(process.env.MAGIC_LINK_TOKEN_LENGTH || '32'),
          expiryMinutes: parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES || '30'),
          maxUsesPerDay: parseInt(process.env.MAGIC_LINK_MAX_USES_PER_DAY || '10'),
          requireExistingUser: process.env.MAGIC_LINK_REQUIRE_EXISTING_USER === 'true',
          autoCreateUser: process.env.MAGIC_LINK_AUTO_CREATE_USER !== 'false'
        },
        
        email: {
          provider: 'mailjet',
          mailjet: {
            apiKey: process.env.MAILJET_API_KEY || '',
            apiSecret: process.env.MAILJET_API_SECRET || '',
            fromEmail: process.env.MAILJET_FROM_EMAIL || process.env.FROM_EMAIL || '',
            fromName: process.env.FROM_NAME || 'SMP Platform',
            templates: {
              magicLink: process.env.MAILJET_TEMPLATE_MAGIC_LINK,
              welcome: process.env.MAILJET_TEMPLATE_WELCOME,
              passwordReset: process.env.MAILJET_TEMPLATE_PASSWORD_RESET,
              mfaCode: process.env.MAILJET_TEMPLATE_MFA_CODE
            },
            sandbox: process.env.NODE_ENV !== 'production'
          }
        },
        
        frontend: {
          baseUrl: process.env.BACKEND_URL || 'http://localhost:3001',
          magicLinkPath: process.env.MAGIC_LINK_PATH || '/auth/magic-link',
          redirectPaths: {
            login: process.env.REDIRECT_LOGIN || '/dashboard',
            register: process.env.REDIRECT_REGISTER || '/welcome',
            resetPassword: process.env.REDIRECT_RESET_PASSWORD || '/auth/password-reset',
            verifyEmail: process.env.REDIRECT_VERIFY_EMAIL || '/auth/email-verified'
          }
        }
      };

      return this.createWithMailjet(redisClient, keycloakClient, config);
    }
    
    throw new Error(`Unsupported or missing email provider: ${provider}. Supported providers: mailjet`);
  }

  private static validateMailjetConfig(config: MagicLinkFactoryConfig): void {
    if (!config.email.mailjet) {
      throw new Error('Mailjet configuration is required');
    }

    if (!config.email.mailjet.apiKey) {
      throw new Error('Mailjet API Key is required');
    }

    if (!config.email.mailjet.apiSecret) {
      throw new Error('Mailjet API Secret is required');
    }

    if (!config.email.mailjet.fromEmail) {
      throw new Error('From email address is required for Mailjet');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.email.mailjet.fromEmail)) {
      throw new Error('Invalid from email address format');
    }
  }

  private static buildFullConfigForMailjet(config: MagicLinkFactoryConfig): MagicLinkConfigImpl {
    return {
      enabled: config.magicLink?.enabled ?? true,
      tokenLength: config.magicLink?.tokenLength ?? 32,
      expiryMinutes: config.magicLink?.expiryMinutes ?? 30,
      maxUsesPerDay: config.magicLink?.maxUsesPerDay ?? 10,
      requireExistingUser: config.magicLink?.requireExistingUser ?? false,
      autoCreateUser: config.magicLink?.autoCreateUser ?? true,
      redirectUrl: '/auth/success',
      emailTemplate: 'magic-link',

      email: {
        provider: 'mailjet',
        config: {
          apiKey: config.email.mailjet!.apiKey,
          apiSecret: config.email.mailjet!.apiSecret,
          fromEmail: config.email.mailjet!.fromEmail,
          fromName: config.email.mailjet!.fromName || 'SMP Platform',
          templates: {
            magicLink: config.email.mailjet!.templates?.magicLink || '',
            mfaCode: config.email.mailjet!.templates?.mfaCode || '',
            welcome: config.email.mailjet!.templates?.welcome || '',
            passwordReset: config.email.mailjet!.templates?.passwordReset || ''
          },
          sandbox: config.email.mailjet!.sandbox ?? (process.env.NODE_ENV !== 'production'),
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000
        },
        templates: {
          magicLink: config.email.mailjet!.templates?.magicLink || 'magic-link-template',
          welcome: config.email.mailjet!.templates?.welcome || 'welcome-template',
          passwordReset: config.email.mailjet!.templates?.passwordReset || 'password-reset-template'
        }
      },

      frontend: {
        baseUrl: config.frontend?.baseUrl || process.env.BACKEND_URL || 'http://localhost:3001',
        magicLinkPath: config.frontend?.magicLinkPath || '/auth/magic-link',
        redirectPaths: {
          login: config.frontend?.redirectPaths?.login || '/dashboard',
          register: config.frontend?.redirectPaths?.register || '/welcome',
          resetPassword: config.frontend?.redirectPaths?.resetPassword || '/auth/password-reset',
          verifyEmail: config.frontend?.redirectPaths?.verifyEmail || '/auth/email-verified'
        }
      }
    };
  }
}