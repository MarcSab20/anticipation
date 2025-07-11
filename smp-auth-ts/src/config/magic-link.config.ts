// smp-auth-ts/src/config/magic-link.config.ts
import { MagicLinkConfig } from '../interface/mfa.interface.js'
import { MailjetConfig } from '../providers/email/mailjet.provider.js'; // NOUVEAU

export interface MagicLinkConfigImpl extends MagicLinkConfig {
  email: {
    provider: 'mailjet'; 
    config: MailjetConfig; 
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
    provider: 'mailjet', 
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
function getDefaultEmailConfig(): MailjetConfig {
  return {
    apiKey: process.env.MAILJET_API_KEY || '',
    apiSecret: process.env.MAILJET_API_SECRET || '',
    fromEmail: process.env.MAILJET_FROM_EMAIL || process.env.FROM_EMAIL || '',
    fromName: process.env.FROM_NAME || 'SMP Platform',
    templates: {
      magicLink: process.env.MAILJET_TEMPLATE_MAGIC_LINK || '',
      mfaCode: process.env.MAILJET_TEMPLATE_MFA_CODE || '',
      welcome: process.env.MAILJET_TEMPLATE_WELCOME || '',
      passwordReset: process.env.MAILJET_TEMPLATE_PASSWORD_RESET || ''
    },
    sandbox: process.env.NODE_ENV !== 'production',
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000
  } as MailjetConfig;
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