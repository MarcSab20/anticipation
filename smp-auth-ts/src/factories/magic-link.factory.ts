
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
    provider:  'twilio'; 
    twilio: { 
      accountSid: string;
      authToken: string;
      fromPhoneNumber?: string; // Pour SMS
      fromEmail?: string; // Pour Email API
      fromName?: string;
      useEmailApi?: boolean; 
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

  static createWithTwilio(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config: MagicLinkFactoryConfig
  ): MagicLinkServiceImpl {
    
    console.log('🏭 Creating Magic Link service with Twilio...');
    
    this.validateTwilioConfig(config);
    const fullConfig: MagicLinkConfigImpl = this.buildFullConfigForTwilio(config);
    
    const service = new MagicLinkServiceImpl(
      redisClient,
      keycloakClient,
      fullConfig
    );

    console.log('✅ Magic Link service created successfully with Twilio');
    return service;
  }

  /**
   * Crée automatiquement selon le provider configuré - MISE À JOUR
   */
  static create(
    redisClient: RedisClient,
    keycloakClient: KeycloakClient,
    config: MagicLinkFactoryConfig
  ): MagicLinkServiceImpl {
    
    switch (config.email.provider) {      
      case 'twilio':
        return this.createWithTwilio(redisClient, keycloakClient, config);
      
      default:
        throw new Error(`Unsupported email provider: ${config.email.provider}`);
    }
  }

  /**
   * Création depuis les variables d'environnement - MISE À JOUR
   */
  static createFromEnvironment(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient
): MagicLinkServiceImpl {
  
  const provider = process.env.EMAIL_PROVIDER;
  
  if (provider === 'twilio') {
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
        provider: 'twilio',
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          fromPhoneNumber: process.env.TWILIO_FROM_PHONE,
          fromEmail: process.env.TWILIO_FROM_EMAIL,
          fromName: process.env.FROM_NAME || 'SMP Platform',
          useEmailApi: process.env.TWILIO_USE_EMAIL_API === 'true',
          templates: {
            magicLink: process.env.TWILIO_TEMPLATE_MAGIC_LINK,
            welcome: process.env.TWILIO_TEMPLATE_WELCOME,
            passwordReset: process.env.TWILIO_TEMPLATE_PASSWORD_RESET,
            mfaCode: process.env.TWILIO_TEMPLATE_MFA_CODE
          },
          sandbox: process.env.NODE_ENV !== 'production'
        }
      },
      
      frontend: {
        baseUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        magicLinkPath: process.env.MAGIC_LINK_PATH || '/auth/magic-link',
        redirectPaths: {
          login: process.env.REDIRECT_LOGIN || '/dashboard',
          register: process.env.REDIRECT_REGISTER || '/welcome',
          resetPassword: process.env.REDIRECT_RESET_PASSWORD || '/auth/password-reset',
          verifyEmail: process.env.REDIRECT_VERIFY_EMAIL || '/auth/email-verified'
        }
      }
    };

    return this.createWithTwilio(redisClient, keycloakClient, config);
  }
  
  // Gestion du cas où le provider n'est pas supporté
  throw new Error(`Unsupported or missing email provider: ${provider}. Supported providers: twilio`);
}

  // Validation Twilio - NOUVEAU
  private static validateTwilioConfig(config: MagicLinkFactoryConfig): void {
    if (!config.email.twilio) {
      throw new Error('Twilio configuration is required');
    }

    if (!config.email.twilio.accountSid) {
      throw new Error('Twilio Account SID is required');
    }

    if (!config.email.twilio.authToken) {
      throw new Error('Twilio Auth Token is required');
    }

    if (config.email.twilio.useEmailApi) {
      if (!config.email.twilio.fromEmail) {
        throw new Error('From email address is required for Twilio Email API');
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(config.email.twilio.fromEmail)) {
        throw new Error('Invalid from email address format');
      }
    } else {
      if (!config.email.twilio.fromPhoneNumber) {
        throw new Error('From phone number is required for Twilio SMS');
      }
      
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(config.email.twilio.fromPhoneNumber)) {
        throw new Error('Invalid phone number format (use E.164 format)');
      }
    }
  }

  // Build config Twilio - NOUVEAU
  private static buildFullConfigForTwilio(config: MagicLinkFactoryConfig): MagicLinkConfigImpl {
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
        provider: 'twilio',
        config: {
          accountSid: config.email.twilio!.accountSid,
          authToken: config.email.twilio!.authToken,
          fromPhoneNumber: config.email.twilio!.fromPhoneNumber,
          fromEmail: config.email.twilio!.fromEmail,
          fromName: config.email.twilio!.fromName || 'SMP Platform',
          useEmailApi: config.email.twilio!.useEmailApi ?? false,
          templates: {
            magicLink: config.email.twilio!.templates?.magicLink || '',
            mfaCode: config.email.twilio!.templates?.mfaCode || '',
            welcome: config.email.twilio!.templates?.welcome || '',
            passwordReset: config.email.twilio!.templates?.passwordReset || ''
          },
          sandbox: config.email.twilio!.sandbox ?? (process.env.NODE_ENV !== 'production'),
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000
        },
        templates: {
          magicLink: config.email.twilio!.templates?.magicLink || 'magic-link-template',
          welcome: config.email.twilio!.templates?.welcome || 'welcome-template',
          passwordReset: config.email.twilio!.templates?.passwordReset || 'password-reset-template'
        }
      },

      frontend: {
        baseUrl: config.frontend?.baseUrl || process.env.FRONTEND_URL || 'http://localhost:3000',
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