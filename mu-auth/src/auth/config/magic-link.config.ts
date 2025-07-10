
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
    provider: 'twilio';
    twilio?: {
      accountSid: string;
      authToken: string;
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
    provider: 'twilio';
    twilio: {
      accountSid: string;
      authToken: string;
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
      provider: 'twilio',
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromPhoneNumber: process.env.TWILIO_FROM_PHONE,
        fromEmail: process.env.TWILIO_FROM_EMAIL,
        fromName: process.env.FROM_NAME || 'SMP Platform',
        useEmailApi: process.env.TWILIO_USE_EMAIL_API === 'true',
        templates: {
          magicLink: process.env.TWILIO_TEMPLATE_MAGIC_LINK || '',
          welcome: process.env.TWILIO_TEMPLATE_WELCOME || '',
          passwordReset: process.env.TWILIO_TEMPLATE_PASSWORD_RESET || '',
          mfaCode: process.env.TWILIO_TEMPLATE_MFA_CODE || ''
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
      provider: 'twilio',
      twilio: muConfig.email.twilio
    },
    
    frontend: muConfig.frontend
  };
}