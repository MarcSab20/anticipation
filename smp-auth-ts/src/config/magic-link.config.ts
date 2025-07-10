import { MagicLinkConfig } from '../interface/mfa.interface.js'
import { TwilioConfig } from '../providers/email/twilio.provider.js'; // NOUVEAU

export interface MagicLinkConfigImpl extends MagicLinkConfig {
  email: {
    provider: 'twilio'; 
    config: TwilioConfig; 
    templates: {
      magicLink: string;
      welcome: string;
      passwordReset: string;
    };
  };
  frontend: {
    baseUrl: string;
    magicLinkPath: string;
    redirectPaths: {
      login: string;
      register: string;
      resetPassword: string;
      verifyEmail: string;
    };
  };
}

export const defaultMagicLinkConfig: MagicLinkConfigImpl = {
  enabled: true,
  tokenLength: 32,
  expiryMinutes: 30,
  maxUsesPerDay: 10,
  requireExistingUser: false,
  autoCreateUser: true,
  redirectUrl: '/auth/success',
  emailTemplate: 'magic-link',

  email: {
    provider: 'twilio', 
    config: getDefaultEmailConfig(), 
    templates: {
      magicLink: 'magic-link-template',
      welcome: 'welcome-template',
      passwordReset: 'password-reset-template'
    }
  },
  frontend: {
    baseUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    magicLinkPath: '/auth/magic-link',
    redirectPaths: {
      login: '/dashboard',
      register: '/welcome',
      resetPassword: '/auth/password-reset',
      verifyEmail: '/auth/email-verified'
    }
  }
};

// NOUVELLE FONCTION pour déterminer la config par défaut selon le provider
function getDefaultEmailConfig(): TwilioConfig {
  const provider = 'twilio';

    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromPhoneNumber: process.env.TWILIO_FROM_PHONE || '',
      fromEmail: process.env.TWILIO_FROM_EMAIL,
      fromName: process.env.FROM_NAME || 'SMP Platform',
      useEmailApi: process.env.TWILIO_USE_EMAIL_API === 'true',
      templates: {
        magicLink: process.env.TWILIO_TEMPLATE_MAGIC_LINK || '',
        mfaCode: process.env.TWILIO_TEMPLATE_MFA_CODE || '',
        welcome: process.env.TWILIO_TEMPLATE_WELCOME || '',
        passwordReset: process.env.TWILIO_TEMPLATE_PASSWORD_RESET || ''
      },
      sandbox: process.env.NODE_ENV !== 'production',
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000
    } as TwilioConfig;
}

export function loadMagicLinkConfig(overrides?: Partial<MagicLinkConfigImpl>): MagicLinkConfigImpl {
  return {
    ...defaultMagicLinkConfig,
    ...overrides,
    email: {
      ...defaultMagicLinkConfig.email,
      ...overrides?.email,
      config: {
        ...defaultMagicLinkConfig.email.config,
        ...overrides?.email?.config
      }
    },
    frontend: {
      ...defaultMagicLinkConfig.frontend,
      ...overrides?.frontend
    }
  };
}