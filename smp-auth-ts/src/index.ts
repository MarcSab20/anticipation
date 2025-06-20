/**
 * Index principal de smp-auth-ts - Version simplifiée
 * Export consolidé avec factory functions essentielles
 */

// ============================================================================
// EXPORTS DES INTERFACES
// ============================================================================

export * from './interface/auth.interface.js';
export * from './interface/opa.interface.js';
export * from './interface/redis.interface.js';
export * from './interface/common.js';

// ============================================================================
// EXPORTS DES CLIENTS
// ============================================================================

export { KeycloakClientImpl } from './clients/keycloak.client.js';
export { OPAClientImpl } from './clients/opa.client.js';
export { RedisClientImpl } from './clients/redis.client.js';

// ============================================================================
// EXPORTS DES SERVICES
// ============================================================================

export { AuthService } from './services/auth.service.js';

// ============================================================================
// EXPORTS DE CONFIGURATION
// ============================================================================

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

// ============================================================================
// EXPORTS DES UTILITAIRES
// ============================================================================

export { 
  getEnv, 
  requireEnv, 
  parseEnvInt, 
  parseEnvBool,
  validateSmpAuthEnv,
  checkEnvironmentHealth 
} from './utils/env.js';

// ============================================================================
// FACTORY FUNCTIONS PRINCIPALES
// ============================================================================

import { AuthConfig } from './interface/common.js';
import { AuthenticationOptions, IAuthenticationService } from './interface/auth.interface.js';
import { KeycloakConfig, KeycloakClientExtended } from './interface/auth.interface.js';
import { OPAConfig, OPAClientExtended } from './interface/opa.interface.js';
import { RedisConfig, RedisClientExtended } from './interface/redis.interface.js';

import { KeycloakClientImpl } from './clients/keycloak.client.js';
import { OPAClientImpl } from './clients/opa.client.js';
import { RedisClientImpl } from './clients/redis.client.js';
import { AuthService } from './services/auth.service.js';
import { loadConfig } from './config.js';

/**
 * Factory pour créer un service d'authentification complet
 */
export function createAuthService(
  config?: Partial<AuthConfig>,
  options?: AuthenticationOptions
): IAuthenticationService {
  const fullConfig = config ? loadConfig(config) : loadConfig();
  return new AuthService(fullConfig, options);
}

/**
 * Factory pour créer un client Keycloak
 */
export function createKeycloakClient(config: KeycloakConfig): KeycloakClientExtended {
  return new KeycloakClientImpl(config) as KeycloakClientExtended;
}

/**
 * Factory pour créer un client OPA
 */
export function createOPAClient(config: OPAConfig): OPAClientExtended {
  return new OPAClientImpl(config) as OPAClientExtended;
}

/**
 * Factory pour créer un client Redis
 */
export function createRedisClient(config: RedisConfig): RedisClientExtended {
  return new RedisClientImpl(config) as RedisClientExtended;
}

// ============================================================================
// FACTORY FUNCTIONS AVANCÉES
// ============================================================================

/**
 * Crée un service d'authentification à partir de variables d'environnement
 */
export function createAuthServiceFromEnv(
  options?: AuthenticationOptions
): IAuthenticationService {
  const config = loadConfig();
  return new AuthService(config, options);
}

/**
 * Crée un service d'authentification pour les tests
 */
export function createTestAuthService(
  overrides?: Partial<AuthConfig>,
  options?: AuthenticationOptions
): IAuthenticationService {
  const testConfig = {
    keycloak: {
      url: 'http://localhost:8080',
      realm: 'test-realm',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      timeout: 5000,
      enableCache: false,
      ...overrides?.keycloak
    },
    opa: {
      url: 'http://localhost:8181',
      policyPath: '/v1/data/authz/decision',
      timeout: 3000,
      enableBatching: false,
      ...overrides?.opa
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 15,
      prefix: 'test:smp:auth',
      tls: false,
      ...overrides?.redis
    },
    global: {
      environment: 'test' as const,
      logLevel: 'warn' as const,
      enableMetrics: false,
      ...overrides?.global
    }
  };
  
  const testOptions: AuthenticationOptions = {
    enableCache: false,
    enableLogging: false,
    enableSessionTracking: false,
    development: {
      enableDebugLogging: true,
      mockMode: false,
      bypassAuthentication: false
    },
    ...options
  };
  
  return new AuthService(testConfig as AuthConfig, testOptions);
}

/**
 * Crée un service d'authentification en mode mock pour les tests unitaires
 */
export function createMockAuthService(
  mockResponses?: {
    tokenValidation?: boolean;
    authorizationDecision?: boolean;
    userInfo?: any;
  },
  options?: AuthenticationOptions
): IAuthenticationService {
  const mockOptions: AuthenticationOptions = {
    development: {
      mockMode: true,
      bypassAuthentication: mockResponses?.tokenValidation ?? true,
      enableDebugLogging: true
    },
    enableCache: false,
    enableLogging: false,
    enableSessionTracking: false,
    ...options
  };
  
  const mockConfig: AuthConfig = {
    keycloak: {
      url: 'http://mock-keycloak',
      realm: 'mock',
      clientId: 'mock',
      clientSecret: 'mock'
    },
    opa: {
      url: 'http://mock-opa',
      policyPath: '/mock'
    },
    redis: {
      host: 'mock-redis',
      port: 6379
    }
  };
  
  return new AuthService(mockConfig, mockOptions);
}

// ============================================================================
// HELPERS DE VALIDATION
// ============================================================================

/**
 * Valide une configuration d'authentification
 */
export async function validateAuthConfig(config: AuthConfig): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const { validateConfig } = await import('./config.js');
  return validateConfig(config);
}

/**
 * Teste la connectivité de tous les services
 */
export async function testConnectivity(config: AuthConfig): Promise<{
  keycloak: boolean;
  opa: boolean;
  redis: boolean;
  overall: boolean;
}> {
  const authService = createAuthService(config);
  
  try {
    const [keycloakResult, opaResult, redisResult] = await Promise.allSettled([
      authService.testKeycloakConnection(),
      authService.testOPAConnection(),
      authService.testRedisConnection()
    ]);
    
    const keycloak = keycloakResult.status === 'fulfilled' && keycloakResult.value.connected;
    const opa = opaResult.status === 'fulfilled' && opaResult.value.connected;
    const redis = redisResult.status === 'fulfilled' && redisResult.value.connected;
    
    await authService.close();
    
    return {
      keycloak,
      opa,
      redis,
      overall: keycloak && opa && redis
    };
  } catch (error) {
    await authService.close();
    return {
      keycloak: false,
      opa: false,
      redis: false,
      overall: false
    };
  }
}

// ============================================================================
// HELPERS D'INITIALISATION
// ============================================================================

/**
 * Initialise un service d'authentification avec vérifications
 */
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
    
    if (options?.testConnectivity !== false) {
      const connectivity = await testConnectivity(fullConfig);
      connectivityOk = connectivity.overall;
      
      if (!connectivity.keycloak) errors.push('Keycloak connection failed');
      if (!connectivity.opa) errors.push('OPA connection failed');
      if (!connectivity.redis) errors.push('Redis connection failed');
    }
    
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
    
    const fallbackService = createMockAuthService();
    
    return {
      service: fallbackService,
      status: {
        configValid: false,
        connectivityOk: false,
        ready: false
      },
      errors
    };
  }
}

/**
 * Initialise et démarre un service d'authentification de manière robuste
 */
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

// ============================================================================
// CONSTANTES ET VERSION
// ============================================================================

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
  // Factory functions principales
  createAuthService,
  createKeycloakClient,
  createOPAClient,
  createRedisClient,
  
  // Factory functions avancées
  createTestAuthService,
  createMockAuthService,
  createAuthServiceFromEnv,
  
  // Initialisation et démarrage
  initializeAuthService,
  startAuthService,
  
  // Validation et test
  validateAuthConfig,
  testConnectivity,
  
  // Constantes
  VERSION,
  LIBRARY_INFO,
  PRESET_CONFIGS
};

export default smpAuth;