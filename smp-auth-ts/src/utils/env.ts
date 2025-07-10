import { ValidationResult } from '../interface/common.js';

// ============================================================================
// FONCTIONS DE BASE
// ============================================================================

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return '';
  }
  return value;
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

export function parseEnvInt(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer, got: ${value}`);
  }
  
  return parsed;
}

export function parseEnvFloat(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
  }
  
  return parsed;
}

export function parseEnvBool(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  
  const lowercased = value.toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(lowercased)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'disabled'].includes(lowercased)) {
    return false;
  }
  
  throw new Error(`Environment variable ${key} must be a valid boolean, got: ${value}`);
}

export function parseEnvJson<T = any>(key: string, defaultValue?: T): T {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Environment variable ${key} must be valid JSON, got: ${value}`);
  }
}

export function parseEnvArray(key: string, separator: string = ',', defaultValue?: string[]): string[] {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return [];
  }
  
  return value.split(separator).map(item => item.trim()).filter(item => item.length > 0);
}

// ============================================================================
// DÉTECTION D'ENVIRONNEMENT
// ============================================================================

export function detectEnvironment(): string {
  return getEnv('NODE_ENV', 'development').toLowerCase();
}

export function isDevelopment(): boolean {
  return detectEnvironment() === 'development';
}

export function isProduction(): boolean {
  return detectEnvironment() === 'production';
}

export function isTest(): boolean {
  return detectEnvironment() === 'test';
}

export function isStaging(): boolean {
  return detectEnvironment() === 'staging';
}

// ============================================================================
// VALIDATION D'ENVIRONNEMENT SIMPLIFIÉE
// ============================================================================

export interface EnvValidationResult extends ValidationResult {
  missing: string[];
  invalid: Array<{
    key: string;
    value: string;
    error: string;
  }>;
  values: Record<string, any>;
}

export interface EnvSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'json';
    defaultValue?: any;
    validator?: (value: any) => boolean | string;
    description?: string;
  };
}

export function validateEnvSchema(schema: EnvSchema): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    missing: [],
    invalid: [],
    values: {}
  };
  
  for (const [key, options] of Object.entries(schema)) {
    const value = process.env[key];
    const hasValue = value !== undefined && value !== '';
    
    if (options.required && !hasValue) {
      result.missing.push(key);
      result.errors = result.errors ?? [];
      result.errors.push(`Environment variable ${key} is required but not set`);
      result.valid = false;
      continue;
    }
    
    let finalValue = hasValue ? value : options.defaultValue;
    
    if (finalValue === undefined) {
      continue;
    }
    
    // Conversion de type
    if (options.type && typeof finalValue === 'string') {
      try {
        switch (options.type) {
          case 'number':
            finalValue = parseFloat(finalValue);
            if (isNaN(finalValue)) {
              throw new Error('Must be a valid number');
            }
            break;
          case 'boolean':
            const lowercased = finalValue.toLowerCase();
            if (['true', '1', 'yes', 'on'].includes(lowercased)) {
              finalValue = true;
            } else if (['false', '0', 'no', 'off'].includes(lowercased)) {
              finalValue = false;
            } else {
              throw new Error('Must be a valid boolean');
            }
            break;
          case 'json':
            finalValue = JSON.parse(finalValue);
            break;
        }
      } catch (error) {
        result.invalid.push({
          key,
          value: value || '',
          error: error instanceof Error ? error.message : String(error)
        });
        result.errors = result.errors ?? [];
        result.errors.push(`Environment variable ${key}: ${error instanceof Error ? error.message : String(error)}`);
        result.valid = false;
        continue;
      }
    }
    
    // Validation personnalisée
    if (options.validator) {
      const validationResult = options.validator(finalValue);
      if (validationResult !== true) {
        const errorMessage = typeof validationResult === 'string' ? validationResult : 'Validation failed';
        result.invalid.push({
          key,
          value: value || '',
          error: errorMessage
        });
        result.errors = result.errors ?? [];
        result.errors.push(`Environment variable ${key}: ${errorMessage}`);
        result.valid = false;
        continue;
      }
    }
    
    result.values[key] = finalValue;
  }
  
  return result;
}

// ============================================================================
// SCHÉMAS PRÉDÉFINIS SIMPLIFIÉS
// ============================================================================

export const SMP_AUTH_SCHEMA: EnvSchema = {
  // Keycloak
  KEYCLOAK_URL: {
    required: true,
    type: 'string',
    validator: (value: string) => value.startsWith('http'),
    description: 'Keycloak server URL'
  },
  KEYCLOAK_REALM: {
    required: true,
    type: 'string',
    description: 'Keycloak realm'
  },
  KEYCLOAK_CLIENT_ID: {
    required: true,
    type: 'string',
    description: 'Keycloak client ID'
  },
  KEYCLOAK_CLIENT_SECRET: {
    required: true,
    type: 'string',
    description: 'Keycloak client secret'
  },
  KEYCLOAK_TIMEOUT: {
    type: 'number',
    defaultValue: 10000,
    validator: (value: number) => value > 0,
    description: 'Keycloak request timeout in milliseconds'
  },

  // OPA
  OPA_URL: {
    required: true,
    type: 'string',
    validator: (value: string) => value.startsWith('http'),
    description: 'OPA server URL'
  },
  OPA_POLICY_PATH: {
    type: 'string',
    defaultValue: '/v1/data/authz/decision',
    validator: (value: string) => value.startsWith('/'),
    description: 'OPA policy evaluation path'
  },
  OPA_TIMEOUT: {
    type: 'number',
    defaultValue: 5000,
    validator: (value: number) => value > 0,
    description: 'OPA request timeout in milliseconds'
  },

  // Redis
  REDIS_HOST: {
    type: 'string',
    defaultValue: 'localhost',
    description: 'Redis server host'
  },
  REDIS_PORT: {
    type: 'number',
    defaultValue: 6379,
    validator: (value: number) => value > 0 && value < 65536,
    description: 'Redis server port'
  },
  REDIS_PASSWORD: {
    type: 'string',
    description: 'Redis password'
  },
  REDIS_DB: {
    type: 'number',
    defaultValue: 0,
    validator: (value: number) => value >= 0 && value <= 15,
    description: 'Redis database number'
  },
  REDIS_PREFIX: {
    type: 'string',
    defaultValue: 'smp:auth',
    description: 'Redis key prefix'
  },
  REDIS_TLS: {
    type: 'boolean',
    defaultValue: false,
    description: 'Enable Redis TLS'
  }
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

export function validateSmpAuthEnv(): EnvValidationResult {
  return validateEnvSchema(SMP_AUTH_SCHEMA);
}

export function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const fs = require('fs');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const result: Record<string, string> = {};
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) {
        continue;
      }
      
      const key = trimmed.substring(0, equalsIndex).trim();
      let value = trimmed.substring(equalsIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      
      result[key] = value;
      
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    
    return result;
  } catch (error) {
    throw new Error(`Failed to load environment file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function printEnvSummary(): void {
  console.log('=== Environment Summary ===');
  console.log(`Node Environment: ${detectEnvironment()}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Process ID: ${process.pid}`);
  console.log('');
}

export function checkEnvironmentHealth(): boolean {
  const result = validateSmpAuthEnv();
  
  console.log('=== Environment Health Check ===');
  
  if (result.valid) {
    console.log('✅ All environment variables are valid');
  } else {
    console.log('❌ Environment validation failed');
    
    if (result.missing.length > 0) {
      console.log('\nMissing required variables:');
      result.missing.forEach(key => console.log(`  - ${key}`));
    }
    
    if (result.invalid.length > 0) {
      console.log('\nInvalid variables:');
      result.invalid.forEach(({ key, error }) => console.log(`  - ${key}: ${error}`));
    }
  }
  result.warnings = result.warnings ?? [];
  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(warning => console.log(`  ⚠️ ${warning}`));
  }
  
  console.log('');
  return result.valid;
}

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

const envUtils = {
  getEnv,
  requireEnv,
  parseEnvInt,
  parseEnvFloat,
  parseEnvBool,
  parseEnvJson,
  parseEnvArray,
  detectEnvironment,
  isDevelopment,
  isProduction,
  isTest,
  isStaging,
  validateEnvSchema,
  validateSmpAuthEnv,
  loadEnvFile,
  printEnvSummary,
  checkEnvironmentHealth,
  SMP_AUTH_SCHEMA
};

export default envUtils;