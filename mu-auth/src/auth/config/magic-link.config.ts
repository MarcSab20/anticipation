import { MagicLinkFactoryConfig } from 'smp-auth-ts';

export interface MuAuthMagicLinkConfig {
  // Configuration Magic Link
  enabled: boolean;
  tokenLength: number;
  expiryMinutes: number;
  maxUsesPerDay: number;
  requireExistingUser: boolean;
  autoCreateUser: boolean;
  
  // Configuration SendGrid
  sendGrid: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
    templates: {
      magicLink: string;
      welcome: string;
      passwordReset: string;
      mfaCode: string;
    };
    sandbox: boolean;
  };
  
  // Configuration Frontend
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

export function loadMagicLinkConfig(): MuAuthMagicLinkConfig {
  return {
    enabled: process.env.MAGIC_LINK_ENABLED !== 'false',
    tokenLength: parseInt(process.env.MAGIC_LINK_TOKEN_LENGTH || '32'),
    expiryMinutes: parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES || '30'),
    maxUsesPerDay: parseInt(process.env.MAGIC_LINK_MAX_USES_PER_DAY || '10'),
    requireExistingUser: process.env.MAGIC_LINK_REQUIRE_EXISTING_USER === 'true',
    autoCreateUser: process.env.MAGIC_LINK_AUTO_CREATE_USER !== 'false',
    
    sendGrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'noreply@smp-platform.com',
      fromName: process.env.FROM_NAME || 'SMP Platform',
      templates: {
        magicLink: process.env.SENDGRID_TEMPLATE_MAGIC_LINK || '',
        welcome: process.env.SENDGRID_TEMPLATE_WELCOME || '',
        passwordReset: process.env.SENDGRID_TEMPLATE_PASSWORD_RESET || '',
        mfaCode: process.env.SENDGRID_TEMPLATE_MFA_CODE || ''
      },
      sandbox: process.env.NODE_ENV !== 'production'
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
}

export function convertToSmpAuthConfig(muConfig: MuAuthMagicLinkConfig): MagicLinkFactoryConfig {
  return {
    magicLink: {
      enabled: muConfig.enabled,
      tokenLength: muConfig.tokenLength,
      expiryMinutes: muConfig.expiryMinutes,
      maxUsesPerDay: muConfig.maxUsesPerDay,
      requireExistingUser: muConfig.requireExistingUser,
      autoCreateUser: muConfig.autoCreateUser
    },
    
    email: {
      provider: 'sendgrid',
      sendgrid: {
        apiKey: muConfig.sendGrid.apiKey,
        fromEmail: muConfig.sendGrid.fromEmail,
        fromName: muConfig.sendGrid.fromName,
        templates: muConfig.sendGrid.templates,
        sandbox: muConfig.sendGrid.sandbox
      }
    },
    
    frontend: muConfig.frontend
  };
}