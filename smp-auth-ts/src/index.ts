
export * from './interface/auth.interface.js';
export * from './interface/opa.interface.js';
export * from './interface/redis.interface.js';
export * from './interface/common.js';
export * from './interface/mfa.interface.js';
export * from './interface/email.interface.js';

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
import { TwilioProvider } from './providers/email/twilio.provider.js';

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

export function createMagicLinkWithTwilio(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient,
  twilioConfig: {
    accountSid: string;
    authToken: string;
    fromEmail?: string;
    fromPhoneNumber?: string;
    fromName?: string;
    useEmailApi?: boolean;
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
  return MagicLinkServiceImpl.createWithTwilio(
    redisClient,
    keycloakClient,
    twilioConfig,
    magicLinkConfig
  );
}

export function createEmailServiceWithTwilio(config: {
  accountSid: string;
  authToken: string;
  fromEmail?: string;
  fromPhoneNumber?: string;
  fromName?: string;
  useEmailApi?: boolean;
  templates?: {
    magicLink: string;
    mfaCode: string;
    welcome: string;
    passwordReset: string;
  };
  sandbox?: boolean;
}): EmailServiceImpl {
  const emailService = new EmailServiceImpl();
  const twilioProvider = new TwilioProvider(config);
  
  emailService.registerProvider('twilio', twilioProvider);
  emailService.setDefaultProvider('twilio');
  
  return emailService;
}

export function createMagicLinkFromEnv(
  redisClient: RedisClient,
  keycloakClient: KeycloakClient
): MagicLinkServiceImpl {
  
  const requiredVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for Magic Link: ${missing.join(', ')}`);
  }

  // Vérifier qu'au moins un moyen de communication est configuré
  if (!process.env.TWILIO_FROM_EMAIL && !process.env.TWILIO_FROM_PHONE) {
    throw new Error('Either TWILIO_FROM_EMAIL or TWILIO_FROM_PHONE must be configured');
  }

  const twilioConfig = {
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    fromEmail: process.env.TWILIO_FROM_EMAIL,
    fromPhoneNumber: process.env.TWILIO_FROM_PHONE,
    fromName: process.env.FROM_NAME || 'SMP Platform',
    useEmailApi: process.env.TWILIO_USE_EMAIL_API === 'true',
    templates: {
      magicLink: process.env.TWILIO_TEMPLATE_MAGIC_LINK,
      welcome: process.env.TWILIO_TEMPLATE_WELCOME,
      passwordReset: process.env.TWILIO_TEMPLATE_PASSWORD_RESET,
      mfaCode: process.env.TWILIO_TEMPLATE_MFA_CODE
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

  return createMagicLinkWithTwilio(
    redisClient,
    keycloakClient,
    twilioConfig,
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