import type { KeycloakConfig } from './auth.interface.js';
import type { OPAConfig } from './opa.interface.js';
import type { RedisConfig } from './redis.interface.js';

export interface AuthConfig {
  keycloak: KeycloakConfig;
  opa: OPAConfig;
  redis: RedisConfig;
  global?: {
    environment?: 'development' | 'staging' | 'production' | 'test';
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    enableMetrics?: boolean;
    enableHealthCheck?: boolean;
  };
}

export interface DefaultConfig {
  KEYCLOAK_URL: string;
  KEYCLOAK_REALM: string;
  KEYCLOAK_CLIENT_ID: string;
  KEYCLOAK_CLIENT_SECRET: string;
  KEYCLOAK_TIMEOUT: string;
  OPA_URL: string;
  OPA_POLICY_PATH: string;
  OPA_TIMEOUT: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD?: string;
  REDIS_DB: string;
  REDIS_PREFIX: string;
  REDIS_TLS: string;
}

export type UserId = string;
export type ResourceId = string;
export type SessionId = string;
export type CorrelationId = string;
export type OrganizationId = string;

export type Action = string; 
export type ResourceType = string;
export type EntityState = 'active' | 'inactive' | 'pending' | 'archived' | 'deleted';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type OperationStatus = 'success' | 'failure' | 'pending' | 'cancelled' | 'timeout';

export interface AuthorizationRequest {
  userId: UserId;
  resourceId: ResourceId;
  resourceType: ResourceType;
  action: Action;
  context?: AuthorizationContext;
  timestamp?: string;
  correlationId?: CorrelationId;
}

export interface AuthorizationContext {
  currentDate?: string;
  businessHours?: boolean;
  ip?: string;
  userAgent?: string;
  organizationId?: OrganizationId;
  departmentId?: string;
  riskScore?: number;
  securityLevel?: string;
  [key: string]: any;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  timestamp?: string;
  evaluationTime?: number;
  cached?: boolean;
  correlationId?: CorrelationId;
}

export interface OperationOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  correlationId?: CorrelationId;
  metadata?: Record<string, any>;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: OperationError;
  timestamp: string;
  duration?: number;
  correlationId?: CorrelationId;
}

export interface OperationError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
  correlationId?: CorrelationId;
  timestamp?: string;
  retryable?: boolean;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  pagination: PaginationOptions;
}

export interface FilterOptions {
  search?: string;
  filters?: Record<string, any>;
  dateRange?: {
    from: string;
    to: string;
  };
  status?: EntityState[];
}

export interface CacheOptions {
  ttl?: number;
  version?: string;
  tags?: string[];
  namespace?: string;
}

export interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  errorRate: number;
  startTime: string;
  lastUpdate: string;
  uptime: number;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  data?: any;
}

export type TransformFunction<T, U> = (input: T) => U | Promise<U>;
export type ValidationFunction<T> = (input: T) => boolean | ValidationResult;
export type CallbackFunction<T = any> = (error?: Error, result?: T) => void;
export type EventHandler<T = any> = (event: T) => void | Promise<void>;

export const DEFAULT_TIMEOUTS = {
  CONNECTION: 10000,
  REQUEST: 30000,
  TOKEN_VALIDATION: 5000,
  AUTHORIZATION_CHECK: 10000,
  CACHE_OPERATION: 1000,
  HEALTH_CHECK: 5000
} as const;

export const DEFAULT_RETRY = {
  ATTEMPTS: 3,
  DELAY: 1000,
  BACKOFF_FACTOR: 2,
  MAX_DELAY: 30000
} as const;

export const DEFAULT_CACHE = {
  TTL: 3600,
  MAX_SIZE: 1000,
  CLEANUP_INTERVAL: 300000
} as const;

export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_TOKEN_INVALID: 'AUTH_003',
  AUTH_USER_NOT_FOUND: 'AUTH_004',
  
  AUTHZ_ACCESS_DENIED: 'AUTHZ_001',
  AUTHZ_INSUFFICIENT_PERMISSIONS: 'AUTHZ_002',
  AUTHZ_RESOURCE_NOT_FOUND: 'AUTHZ_003',
  AUTHZ_POLICY_ERROR: 'AUTHZ_004',

  SERVICE_UNAVAILABLE: 'SVC_001',
  SERVICE_TIMEOUT: 'SVC_002',
  SERVICE_OVERLOADED: 'SVC_003',
  
  CONFIG_INVALID: 'CFG_001',
  CONFIG_MISSING: 'CFG_002',
  CONFIG_CONNECTION_FAILED: 'CFG_003',

  VALIDATION_FAILED: 'VAL_001',

  CACHE_CONNECTION_FAILED: 'CACHE_001',
  CACHE_OPERATION_FAILED: 'CACHE_002'
} as const;