
export * from './interface/auth.interface.js';
export * from './interface/opa.interface.js';
export * from './interface/redis.interface.js';
export * from './interface/common.js';
export * from './interface/mfa.interface.js';
export * from './interface/email.interface.js';
export * from './interface/oauth.interface.js';
export * from './config/oauth.config.js';

export { KeycloakClientImpl } from './clients/keycloak.client.js';
export { OPAClientImpl } from './clients/opa.client.js';
export { RedisClientImpl } from './clients/redis.client.js';

export { AuthService } from './services/auth.service.js';
export { ExtendedAuthService,
         createExtendedAuthService,
        ExtendedAuthConfig,
        ExtendedAuthOptions,
        LoginWithMFAResult,
        AuthenticationFlow } 
  from './services/auth-extended.service.js';

export { MagicLinkServiceImpl } from './services/magic-link.service.js';
export { MFAServiceImpl } from './services/mfa.service.js';
export { EmailServiceImpl, createEmailService } from './services/email.service.js';


export {
  loadConfig,
  loadConfigFromFile,
  loadConfigFromObject,
  loadConfigForEnvironment,
  validateConfig,
  getConfigSummary,
  createTestConfig,
  type ConfigValidationResult
} from './config.js';

export {
  MagicLinkConfigImpl,
  loadMagicLinkConfig,
  defaultMagicLinkConfig
} from './config/magic-link.config.js';

export {
  MagicLinkFactory,
  MagicLinkFactoryConfig,
} from './factories/magic-link.factory.js';

export { 
  getEnv, 
  requireEnv, 
  parseEnvInt, 
  parseEnvBool,
  validateSmpAuthEnv,
  checkEnvironmentHealth 
} from './utils/env.js';

import { AuthConfig } from './interface/common.js';
import { AuthenticationOptions, IAuthenticationService } from './interface/auth.interface.js';
import { KeycloakConfig, KeycloakClient } from './interface/auth.interface.js';
import { OPAConfig, OPAClient } from './interface/opa.interface.js';
import { RedisConfig, RedisClient } from './interface/redis.interface.js';

import { KeycloakClientImpl } from './clients/keycloak.client.js';
import { OPAClientImpl } from './clients/opa.client.js';
import { RedisClientImpl } from './clients/redis.client.js';
import { AuthService } from './services/auth.service.js';
import { loadConfig } from './config.js';
import { MagicLinkServiceImpl } from './services/magic-link.service.js';
import { MagicLinkConfigImpl } from './config/magic-link.config.js';
import { EmailServiceImpl } from './services/email.service.js';
import { MailjetProvider, MailjetConfig } from './providers/email/mailjet.provider.js';
import { GitHubOAuthConfig, GoogleOAuthConfig, loadOAuthConfig, OAuthConfig } from './config/oauth.config.js';
import { OAuthServiceImpl } from './services/oauth.service.js';
import { GoogleOAuthProvider } from './providers/oauth/google.provider.js';
import { GitHubOAuthProvider } from './providers/oauth/github.provider.js';
export { GoogleOAuthProvider } from './providers/oauth/google.provider.js';
export { GitHubOAuthProvider } from './providers/oauth/github.provider.js';
export { OAuthServiceImpl } from './services/oauth.service.js';

export function createAuthService(
  config?: Partial<AuthConfig>,
  options?: AuthenticationOptions
): IAuthenticationService {
  const fullConfig = config ? loadConfig(config) : loadConfig();
  return new AuthService(fullConfig, options);
}

export function createKeycloakClient(config: KeycloakConfig): KeycloakClient {
  return new KeycloakClientImpl(config) as KeycloakClient;
}

export function createOPAClient(config: OPAConfig): OPAClient {
  return new OPAClientImpl(config) as OPAClient;
}

export function createRedisClient(config: RedisConfig): RedisClient {
  return new RedisClientImpl(config) as RedisClient;
}

export function createAuthServiceFromEnv(
  options?: AuthenticationOptions
): IAuthenticationService {
  const config = loadConfig();
  return new AuthService(config, options);
}


export function createMagicLinkService(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient,
  config?: Partial<MagicLinkConfigImpl>
): MagicLinkServiceImpl {
  return new MagicLinkServiceImpl(redisClient, keycloakClient, config);
}

export function createMagicLinkWithMailjet(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient,
  mailjetConfig: {
    apiKey: string;
    apiSecret: string;
    fromEmail: string; // Requis
    fromName?: string;
    templates?: {
      magicLink?: string;
      welcome?: string;
      passwordReset?: string;
      mfaCode?: string;
    };
    sandbox?: boolean;
  },
  magicLinkConfig?: Partial<MagicLinkConfigImpl>
): MagicLinkServiceImpl {
  if (!mailjetConfig.fromEmail) {
    throw new Error('fromEmail is required for Mailjet configuration');
  }

  return MagicLinkServiceImpl.createWithMailjet(
    redisClient,
    keycloakClient,
    mailjetConfig,
    magicLinkConfig
  );
}

export function createEmailServiceWithMailjet(config: {
  apiKey: string;
  apiSecret: string;
  fromEmail: string; // Requis
  fromName?: string;
  templates?: {
    magicLink: string;
    mfaCode: string;
    welcome: string;
    passwordReset: string;
  };
  sandbox?: boolean;
}): EmailServiceImpl {
  // Validation des paramètres requis
  if (!config.fromEmail) {
    throw new Error('fromEmail is required for Mailjet configuration');
  }

  const mailjetConfig: MailjetConfig = {
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    templates: config.templates,
    sandbox: config.sandbox,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000
  };

  const emailService = new EmailServiceImpl();
  const mailjetProvider = new MailjetProvider(mailjetConfig);
  
  emailService.registerProvider('mailjet', mailjetProvider);
  emailService.setDefaultProvider('mailjet');
  
  return emailService;
}

export function createOAuthService(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient,
  config?: Partial<OAuthConfig>
): OAuthServiceImpl {
  const fullConfig = loadOAuthConfig(config);
  return new OAuthServiceImpl(redisClient, keycloakClient, fullConfig);
}

export function createGoogleProvider(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  hostedDomain?: string;
}): GoogleOAuthProvider {
  const googleConfig: GoogleOAuthConfig = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: config.scopes || ['openid', 'email', 'profile'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    enabled: true,
    hostedDomain: config.hostedDomain,
    accessType: 'online',
    prompt: 'select_account'
  };

  return new GoogleOAuthProvider(googleConfig);
}

export function createGitHubProvider(config: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  organizationId?: string;
  teamId?: string;
}): GitHubOAuthProvider {
  const githubConfig: GitHubOAuthConfig = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: config.scopes || ['user:email', 'read:user'],
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    enabled: true,
    allowSignup: true,
    organizationId: config.organizationId,
    teamId: config.teamId
  };

  return new GitHubOAuthProvider(githubConfig);
}

export function createOAuthServiceFromEnv(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient
): OAuthServiceImpl {
  const requiredGoogleVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  const requiredGitHubVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
  
  const hasGoogle = requiredGoogleVars.every(key => process.env[key]);
  const hasGitHub = requiredGitHubVars.every(key => process.env[key]);
  
  if (!hasGoogle && !hasGitHub) {
    throw new Error('At least one OAuth provider must be configured (Google or GitHub)');
  }

  const config = loadOAuthConfig({
    google: hasGoogle ? {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback/google`,
      scopes: process.env.GOOGLE_SCOPES ? process.env.GOOGLE_SCOPES.split(',') : ['openid', 'email', 'profile'],
      enabled: process.env.GOOGLE_OAUTH_ENABLED !== 'false',
      hostedDomain: process.env.GOOGLE_HOSTED_DOMAIN,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      accessType: 'online',
      prompt: 'select_account'
    } : undefined,
    github: hasGitHub ? {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      redirectUri: process.env.GITHUB_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback/github`,
      scopes: process.env.GITHUB_SCOPES ? process.env.GITHUB_SCOPES.split(',') : ['user:email', 'read:user'],
      enabled: process.env.GITHUB_OAUTH_ENABLED !== 'false',
      allowSignup: process.env.GITHUB_ALLOW_SIGNUP !== 'false',
      organizationId: process.env.GITHUB_ORGANIZATION_ID,
      teamId: process.env.GITHUB_TEAM_ID,
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user'
    } : undefined,
    keycloak: {
      brokerCallbackUrl: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/broker/{alias}/endpoint`,
      defaultRoles: process.env.OAUTH_DEFAULT_ROLES ? process.env.OAUTH_DEFAULT_ROLES.split(',') : ['USER'],
      autoCreateUser: process.env.OAUTH_AUTO_CREATE_USER !== 'false',
      syncMode: 'import'
    }
  });

  return new OAuthServiceImpl(redisClient, keycloakClient, config);
}

export async function validateOAuthConfig(config: OAuthConfig): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validation Google
  if (config.google?.enabled) {
    if (!config.google.clientId) {
      errors.push('Google OAuth enabled but GOOGLE_CLIENT_ID not provided');
    }
    if (!config.google.clientSecret) {
      errors.push('Google OAuth enabled but GOOGLE_CLIENT_SECRET not provided');
    }
    if (!config.google.redirectUri) {
      warnings.push('Google OAuth redirect URI not specified, using default');
    }
  }

  // Validation GitHub
  if (config.github?.enabled) {
    if (!config.github.clientId) {
      errors.push('GitHub OAuth enabled but GITHUB_CLIENT_ID not provided');
    }
    if (!config.github.clientSecret) {
      errors.push('GitHub OAuth enabled but GITHUB_CLIENT_SECRET not provided');
    }
    if (!config.github.redirectUri) {
      warnings.push('GitHub OAuth redirect URI not specified, using default');
    }
  }

  // Validation générale
  const hasEnabledProvider = 
    (config.google?.enabled && config.google.clientId) ||
    (config.github?.enabled && config.github.clientId);

  if (!hasEnabledProvider) {
    errors.push('No OAuth providers are enabled or properly configured');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Configuration presets OAuth
export const OAUTH_PRESET_CONFIGS = {
  development: {
    google: {
      redirectUri: 'http://localhost:3001/auth/oauth/callback/google',
      scopes: ['openid', 'email', 'profile'],
      enabled: true
    },
    github: {
      redirectUri: 'http://localhost:3001/auth/oauth/callback/github',
      scopes: ['user:email', 'read:user'],
      enabled: true,
      allowSignup: true
    }
  },
  
  production: {
    google: {
      scopes: ['openid', 'email', 'profile'],
      enabled: true,
      accessType: 'offline', // Pour les refresh tokens en production
      prompt: 'consent'
    },
    github: {
      scopes: ['user:email', 'read:user'],
      enabled: true,
      allowSignup: false // Plus restrictif en production
    }
  }
} as const;

export function createMagicLinkFromEnv(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient
): MagicLinkServiceImpl {
  
  const requiredVars = ['MAILJET_API_KEY', 'MAILJET_API_SECRET'];
  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for Magic Link: ${missing.join(', ')}`);
  }

  if (!process.env.MAILJET_FROM_EMAIL) {
    throw new Error('MAILJET_FROM_EMAIL must be configured');
  }

  const mailjetConfig = {
    apiKey: process.env.MAILJET_API_KEY!,
    apiSecret: process.env.MAILJET_API_SECRET!,
    fromEmail: process.env.MAILJET_FROM_EMAIL!,
    fromName: process.env.FROM_NAME || 'SMP Platform',
    templates: {
      magicLink: process.env.MAILJET_TEMPLATE_MAGIC_LINK,
      welcome: process.env.MAILJET_TEMPLATE_WELCOME,
      passwordReset: process.env.MAILJET_TEMPLATE_PASSWORD_RESET,
      mfaCode: process.env.MAILJET_TEMPLATE_MFA_CODE
    },
    sandbox: process.env.NODE_ENV !== 'production'
  };

  const magicLinkConfig = {
    enabled: process.env.MAGIC_LINK_ENABLED !== 'false',
    tokenLength: parseInt(process.env.MAGIC_LINK_TOKEN_LENGTH || '32'),
    expiryMinutes: parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES || '30'),
    maxUsesPerDay: parseInt(process.env.MAGIC_LINK_MAX_USES_PER_DAY || '10'),
    requireExistingUser: process.env.MAGIC_LINK_REQUIRE_EXISTING_USER === 'true',
    autoCreateUser: process.env.MAGIC_LINK_AUTO_CREATE_USER !== 'false'
  };

  return createMagicLinkWithMailjet(
    redisClient,
    keycloakClient,
    mailjetConfig,
    magicLinkConfig
  );
}

export async function validateAuthConfig(config: AuthConfig): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const { validateConfig } = await import('./config.js');
  return validateConfig(config);
}

export async function initializeAuthService(
  config?: Partial<AuthConfig>,
  options?: AuthenticationOptions & {
    validateConfig?: boolean;
    testConnectivity?: boolean;
  }
): Promise<{
  service: IAuthenticationService;
  status: {
    configValid: boolean;
    connectivityOk: boolean;
    ready: boolean;
  };
  errors: string[];
}> {
  const errors: string[] = [];
  let configValid = true;
  let connectivityOk = true;
  
  try {
    const fullConfig = config ? loadConfig(config) : loadConfig();
    
    if (options?.validateConfig !== false) {
      const validation = await validateAuthConfig(fullConfig);
      configValid = validation.valid;
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    }
    
    const service = createAuthService(fullConfig, options);
    
    
    
    return {
      service,
      status: {
        configValid,
        connectivityOk,
        ready: configValid && connectivityOk
      },
      errors
    };
  } catch (error) {
    errors.push(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    const fullConfig = config ? loadConfig(config) : loadConfig();
    const service = createAuthService(fullConfig, options);

    
    return {
      service: service,
      status: {
        configValid: false,
        connectivityOk: false,
        ready: false
      },
      errors
    };
  }
}

export async function startAuthService(
  config?: Partial<AuthConfig>,
  options?: AuthenticationOptions
): Promise<IAuthenticationService> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await initializeAuthService(config, {
        ...options,
        validateConfig: true,
        testConnectivity: true
      });
      
      if (result.status.ready) {
        console.log('✅ Auth service started successfully');
        return result.service;
      } else {
        console.warn(`⚠️ Auth service started with issues (attempt ${attempt}/${maxRetries}):`, result.errors);
        if (attempt === maxRetries) {
          return result.service;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Auth service start failed (attempt ${attempt}/${maxRetries}):`, lastError.message);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed to start auth service after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

export const VERSION = '2.0.0';

export const LIBRARY_INFO = {
  name: 'smp-auth-ts',
  version: VERSION,
  description: 'Librairie d\'authentification et d\'autorisation TypeScript simplifiée pour SMP',
  author: 'SMP Team',
  license: 'MIT'
} as const;

export const PRESET_CONFIGS = {
  development: {
    global: { environment: 'development' as const, logLevel: 'debug' as const },
    keycloak: { enableCache: false, timeout: 10000 },
    opa: { timeout: 5000, enableBatching: false },
    redis: { db: 0, prefix: 'dev:smp:auth' }
  },
  
  testing: {
    global: { environment: 'test' as const, logLevel: 'warn' as const },
    keycloak: { enableCache: false, timeout: 5000 },
    opa: { timeout: 3000, enableBatching: false },
    redis: { db: 15, prefix: 'test:smp:auth' }
  },
  
  production: {
    global: { environment: 'production' as const, logLevel: 'warn' as const },
    keycloak: { enableCache: true, cacheExpiry: 3600, timeout: 15000 },
    opa: { timeout: 10000, enableBatching: true, batchSize: 50 },
    redis: { db: 0, prefix: 'prod:smp:auth', tls: true }
  }
} as const;

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

const smpAuth = {
  createAuthService,
  createKeycloakClient,
  createOPAClient,
  createRedisClient,
  createAuthServiceFromEnv,
  initializeAuthService,
  startAuthService,
  validateAuthConfig,

  VERSION,
  LIBRARY_INFO,
  PRESET_CONFIGS
};

export default smpAuth;