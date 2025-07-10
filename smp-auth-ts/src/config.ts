/**
 * Configuration simplifiée pour smp-auth-ts
 * Charge et valide la configuration depuis l'environnement
 */

import { AuthConfig, DefaultConfig } from './interface/common.js';
import { KeycloakConfig } from './interface/auth.interface.js';
import { OPAConfig } from './interface/opa.interface.js';
import { RedisConfig } from './interface/redis.interface.js';
import { getEnv } from './utils/env.js';

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

const DEFAULT_ENV_CONFIG: DefaultConfig = {
  KEYCLOAK_URL: 'http://localhost:8080',
  KEYCLOAK_REALM: 'mu-realm',
  KEYCLOAK_CLIENT_ID: 'mu-client',
  KEYCLOAK_CLIENT_SECRET: 'C6wUxtvzdLKJSuEWiRGyr4aNOOx6OnNX',
  KEYCLOAK_TIMEOUT: '10000',
  OPA_URL: 'http://localhost:8181',
  OPA_POLICY_PATH: '/v1/data/authz/decision',
  OPA_TIMEOUT: '5000',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: undefined,
  REDIS_DB: '0',
  REDIS_PREFIX: 'smp:auth',
  REDIS_TLS: 'false',
};

// ============================================================================
// FONCTIONS DE CHARGEMENT DE CONFIGURATION
// ============================================================================

function loadKeycloakConfig(): KeycloakConfig {
  return {
    url: getEnv('KEYCLOAK_URL', DEFAULT_ENV_CONFIG.KEYCLOAK_URL),
    realm: getEnv('KEYCLOAK_REALM', DEFAULT_ENV_CONFIG.KEYCLOAK_REALM),
    clientId: getEnv('KEYCLOAK_CLIENT_ID', DEFAULT_ENV_CONFIG.KEYCLOAK_CLIENT_ID),
    clientSecret: getEnv('KEYCLOAK_CLIENT_SECRET', DEFAULT_ENV_CONFIG.KEYCLOAK_CLIENT_SECRET),
    timeout: parseInt(getEnv('KEYCLOAK_TIMEOUT', DEFAULT_ENV_CONFIG.KEYCLOAK_TIMEOUT)),
    adminClientId: getEnv('KEYCLOAK_ADMIN_CLIENT_ID'),
    adminClientSecret: getEnv('KEYCLOAK_ADMIN_CLIENT_SECRET'),
    enableCache: getEnv('KEYCLOAK_ENABLE_CACHE', 'true') === 'true',
    cacheExpiry: parseInt(getEnv('KEYCLOAK_CACHE_EXPIRY', '3600')),
  };
}

function loadOPAConfig(): OPAConfig {
  return {
    url: getEnv('OPA_URL', DEFAULT_ENV_CONFIG.OPA_URL),
    policyPath: getEnv('OPA_POLICY_PATH', DEFAULT_ENV_CONFIG.OPA_POLICY_PATH),
    timeout: parseInt(getEnv('OPA_TIMEOUT', DEFAULT_ENV_CONFIG.OPA_TIMEOUT)),
    apiVersion: getEnv('OPA_API_VERSION', 'v1'),
    enableBatching: getEnv('OPA_ENABLE_BATCHING', 'false') === 'true',
    batchSize: parseInt(getEnv('OPA_BATCH_SIZE', '50')),
    retryAttempts: parseInt(getEnv('OPA_RETRY_ATTEMPTS', '3')),
    retryDelay: parseInt(getEnv('OPA_RETRY_DELAY', '1000')),
  };
}

function loadRedisConfig(): RedisConfig {
  return {
    host: getEnv('REDIS_HOST', DEFAULT_ENV_CONFIG.REDIS_HOST),
    port: parseInt(getEnv('REDIS_PORT', DEFAULT_ENV_CONFIG.REDIS_PORT)),
    password: getEnv('REDIS_PASSWORD') || undefined,
    db: parseInt(getEnv('REDIS_DB', DEFAULT_ENV_CONFIG.REDIS_DB)),
    prefix: getEnv('REDIS_PREFIX', DEFAULT_ENV_CONFIG.REDIS_PREFIX),
    tls: getEnv('REDIS_TLS', DEFAULT_ENV_CONFIG.REDIS_TLS) === 'true',
    connectTimeout: parseInt(getEnv('REDIS_CONNECT_TIMEOUT', '10000')),
    commandTimeout: parseInt(getEnv('REDIS_COMMAND_TIMEOUT', '5000')),
    retryAttempts: parseInt(getEnv('REDIS_RETRY_ATTEMPTS', '3')),
    retryDelay: parseInt(getEnv('REDIS_RETRY_DELAY', '1000')),
    maxRetriesPerRequest: parseInt(getEnv('REDIS_MAX_RETRIES_PER_REQUEST', '3')),
    lazyConnect: getEnv('REDIS_LAZY_CONNECT', 'false') === 'true',
  };
}

/**
 * Charge la configuration complète depuis les variables d'environnement
 */
export function loadConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  const baseConfig: AuthConfig = {
    keycloak: loadKeycloakConfig(),
    opa: loadOPAConfig(),
    redis: loadRedisConfig(),
  };

  if (overrides) {
    return {
      keycloak: { ...baseConfig.keycloak, ...overrides.keycloak },
      opa: { ...baseConfig.opa, ...overrides.opa },
      redis: { ...baseConfig.redis, ...overrides.redis },
      global: { ...baseConfig.global, ...overrides.global }
    };
  }

  return baseConfig;
}

/**
 * Charge la configuration depuis un fichier JSON
 */
export async function loadConfigFromFile(filePath: string, overrides?: Partial<AuthConfig>): Promise<AuthConfig> {
  try {
    const fs = await import('fs/promises');
    const configData = await fs.readFile(filePath, 'utf-8');
    const fileConfig = JSON.parse(configData) as Partial<AuthConfig>;
    
    const baseConfig = loadConfig();
    const mergedConfig: AuthConfig = {
      keycloak: { ...baseConfig.keycloak, ...fileConfig.keycloak },
      opa: { ...baseConfig.opa, ...fileConfig.opa },
      redis: { ...baseConfig.redis, ...fileConfig.redis },
      global: { ...baseConfig.global, ...fileConfig.global }
    };

    if (overrides) {
      return {
        keycloak: { ...mergedConfig.keycloak, ...overrides.keycloak },
        opa: { ...mergedConfig.opa, ...overrides.opa },
        redis: { ...mergedConfig.redis, ...overrides.redis },
        global: { ...mergedConfig.global, ...overrides.global }
      };
    }

    return mergedConfig;
  } catch (error) {
    console.warn(`Erreur lors du chargement du fichier de configuration: ${error instanceof Error ? error.message : String(error)}`);
    console.warn('Utilisation de la configuration par défaut avec overrides');
    return loadConfig(overrides);
  }
}

/**
 * Charge la configuration depuis un objet JavaScript
 */
export function loadConfigFromObject(configObject: Partial<AuthConfig>): AuthConfig {
  const baseConfig = loadConfig();
  
  return {
    keycloak: { ...baseConfig.keycloak, ...configObject.keycloak },
    opa: { ...baseConfig.opa, ...configObject.opa },
    redis: { ...baseConfig.redis, ...configObject.redis },
    global: { ...baseConfig.global, ...configObject.global }
  };
}

// ============================================================================
// VALIDATION SIMPLIFIÉE
// ============================================================================

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateKeycloakConfig(config: KeycloakConfig): string[] {
  const errors: string[] = [];
  
  if (!config.url) {
    errors.push('Keycloak URL is required');
  } else if (!config.url.startsWith('http')) {
    errors.push('Keycloak URL must start with http:// or https://');
  }
  
  if (!config.realm) {
    errors.push('Keycloak realm is required');
  }
  
  if (!config.clientId) {
    errors.push('Keycloak client ID is required');
  }
  
  if (!config.clientSecret) {
    errors.push('Keycloak client secret is required');
  }
  
  return errors;
}

function validateOPAConfig(config: OPAConfig): string[] {
  const errors: string[] = [];
  
  if (!config.url) {
    errors.push('OPA URL is required');
  } else if (!config.url.startsWith('http')) {
    errors.push('OPA URL must start with http:// or https://');
  }
  
  if (!config.policyPath) {
    errors.push('OPA policy path is required');
  } else if (!config.policyPath.startsWith('/')) {
    errors.push('OPA policy path must start with /');
  }
  
  return errors;
}

function validateRedisConfig(config: RedisConfig): string[] {
  const errors: string[] = [];
  
  if (!config.host) {
    errors.push('Redis host is required');
  }
  
  if (!config.port) {
    errors.push('Redis port is required');
  } else if (config.port < 1 || config.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }
  
  return errors;
}

export function validateConfig(config: AuthConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  errors.push(...validateKeycloakConfig(config.keycloak));
  errors.push(...validateOPAConfig(config.opa));
  errors.push(...validateRedisConfig(config.redis));
  
  // Avertissements pour localhost en production
  const env = config.global?.environment || 'development';
  if (env === 'production') {
    if (config.keycloak.url.includes('localhost')) {
      warnings.push('Using localhost for Keycloak in production');
    }
    if (config.opa.url.includes('localhost')) {
      warnings.push('Using localhost for OPA in production');
    }
    if (config.redis.host === 'localhost') {
      warnings.push('Using localhost for Redis in production');
    }
    if (!config.redis.password) {
      warnings.push('Redis password not set in production');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// UTILITAIRES
// ============================================================================

export function getConfigSummary(config: AuthConfig): Record<string, any> {
  return {
    keycloak: {
      url: config.keycloak.url,
      realm: config.keycloak.realm,
      clientId: config.keycloak.clientId,
      clientSecret: config.keycloak.clientSecret ? '***' : undefined,
      timeout: config.keycloak.timeout,
      enableCache: config.keycloak.enableCache,
    },
    opa: {
      url: config.opa.url,
      policyPath: config.opa.policyPath,
      timeout: config.opa.timeout,
      enableBatching: config.opa.enableBatching,
    },
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      prefix: config.redis.prefix,
      tls: config.redis.tls,
      password: config.redis.password ? '***' : undefined,
    },
    global: config.global
  };
}

export function createTestConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  const testConfig: AuthConfig = {
    keycloak: {
      url: 'http://localhost:8080',
      realm: 'test-realm',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      timeout: 5000,
      enableCache: false,
    },
    opa: {
      url: 'http://localhost:8181',
      policyPath: '/v1/data/authz/decision',
      timeout: 3000,
      enableBatching: false,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 15,
      prefix: 'test:smp:auth',
      tls: false,
    },
    global: {
      environment: 'test',
      logLevel: 'warn',
      enableMetrics: false
    }
  };

  if (overrides) {
    return {
      keycloak: { ...testConfig.keycloak, ...overrides.keycloak },
      opa: { ...testConfig.opa, ...overrides.opa },
      redis: { ...testConfig.redis, ...overrides.redis },
      global: { ...testConfig.global, ...overrides.global }
    };
  }

  return testConfig;
}

export function loadConfigForEnvironment(env?: string): AuthConfig {
  const environment = env || getEnv('NODE_ENV', 'development');
  
  switch (environment) {
    case 'test':
      return createTestConfig();
    
    case 'development':
      return loadConfig({
        global: { environment: 'development', logLevel: 'debug' }
      });
    
    case 'production':
      const prodConfig = loadConfig({
        global: { environment: 'production', logLevel: 'warn' }
      });
      
      const validation = validateConfig(prodConfig);
      
      if (!validation.valid) {
        console.error('Configuration validation failed in production:');
        validation.errors.forEach(error => console.error(`  - ${error}`));
        throw new Error('Invalid configuration for production environment');
      }
      
      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings in production:');
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }
      
      return prodConfig;
    
    default:
      console.warn(`Unknown environment: ${environment}. Using default configuration.`);
      return loadConfig();
  }
}