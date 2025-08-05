
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
      secretKey: string;
      fromPhoneNumber?: string;
      fromEmail?: string;
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

export interface MuAuthMagicLinkConfig {
  // Configuration Magic Link
  enabled: boolean;
  tokenLength: number;
  expiryMinutes: number;
  maxUsesPerDay: number;
  requireExistingUser: boolean;
  autoCreateUser: boolean;
  
  // Configuration Email Provider
  email: {
    provider: 'mailjet';
    mailjet: {
      apiKey: string;
      secretKey: string;
      fromPhoneNumber?: string;
      fromEmail?: string;
      fromName?: string;
      useEmailApi?: boolean;
      templates: {
        magicLink: string;
        welcome: string;
        passwordReset: string;
        mfaCode: string;
      };
      sandbox: boolean;
    };
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
    
    email: {
      provider: 'mailjet',
      mailjet: {
        apiKey: process.env.MAILJET_API_KEY || '',
        secretKey: process.env.MAILJET_API_SECRET || '',
        fromEmail: process.env.MAILJET_FROM_EMAIL,
        fromName: process.env.FROM_NAME || 'SMP Platform',
        useEmailApi: process.env.MAGIC_LINK_ENABLED === 'true',
        templates: {
          magicLink: process.env.MAILJET_TEMPLATE_MAGIC_LINK || '',
          welcome: process.env.MAILJET_TEMPLATE_WELCOME || '',
          passwordReset: process.env.MAILJET_TEMPLATE_PASSWORD_RESET || '',
          mfaCode: process.env.MAILJET_TEMPLATE_MFA_CODE || ''
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
      provider: 'mailjet',
      mailjet: muConfig.email.mailjet
    },
    
    frontend: muConfig.frontend
  };
}