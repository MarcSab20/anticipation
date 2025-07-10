
import type {
  OperationOptions,
  PaginationOptions,
  PaginatedResult,
  FilterOptions,
  CacheOptions,
  PerformanceMetrics,
  ValidationResult,
  UserId,
  SessionId,
  CorrelationId
} from './common.js';


export type { CacheOptions } from './common.js';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  prefix?: string;
  tls?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

export interface RedisOperationOptions extends OperationOptions {
  ttl?: number;
  nx?: boolean; 
  xx?: boolean; 
}

export interface CacheEntry<T = any> {
  data: T;
  cachedAt: string;
  expiresAt: string;
  version?: string;
  metadata?: {
    tags?: string[];
    namespace?: string;
    hits?: number;
    lastAccess?: string;
  };
}

export interface CacheStatistics extends PerformanceMetrics {
  cacheSize: number;
  memoryUsage: number;
  topKeys: Array<{
    key: string;
    hits: number;
    size: number;
    lastAccess: string;
  }>;
}

export interface AuthorizationLog {
  id: string;
  timestamp: string;
  userId: UserId;
  sessionId?: SessionId;
  resourceId: string;
  resourceType: string;
  action: string;
  allowed: boolean;
  reason?: string;
  context?: Record<string, any>;
  evaluationTime?: number;
  correlationId?: CorrelationId;
  ip?: string;
  userAgent?: string;
}

export interface LogFilter extends FilterOptions {
  userId?: UserId;
  resourceId?: string;
  resourceType?: string;
  action?: string;
  allowed?: boolean;
  dateFrom?: string;
  dateTo?: string;
  correlationId?: CorrelationId;
  sessionId?: SessionId;
  sortBy?: 'timestamp' | 'userId' | 'resourceId' | 'action';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface LogSearchResult extends PaginatedResult<AuthorizationLog> {
  searchTime: number;
}

export interface UserSession {
  sessionId: SessionId;
  userId: UserId;
  createdAt: string;
  lastActivity: string;
  expiresAt?: string;
  active: boolean;
  loginMethod?: 'password' | 'sso' | 'token';
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface SessionActivity {
  sessionId: SessionId;
  timestamp: string;
  type: 'login' | 'logout' | 'action' | 'heartbeat' | 'timeout';
  details?: {
    action?: string;
    resource?: string;
    duration?: number;
    result?: 'success' | 'failure';
  };
  context?: {
    ip?: string;
    userAgent?: string;
    riskScore?: number;
  };
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisOperationOptions): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;

  logAuthorizationDecision(log: Omit<AuthorizationLog, 'id' | 'timestamp'>): Promise<void>;
  getAuthorizationHistory(filter: LogFilter): Promise<LogSearchResult>;

  getCache<T>(key: string): Promise<CacheEntry<T> | null>;
  setCache<T>(key: string, data: T, options?: CacheOptions): Promise<void>;
  
  memoize<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T>;

  hGet(key: string, field: string): Promise<string | null>;
  hSet(key: string, field: string, value: string): Promise<void>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, field: string): Promise<void>;

  lPush(key: string, value: string): Promise<number>;
  lPop(key: string): Promise<string | null>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  lTrim(key: string, start: number, stop: number): Promise<void>;

  sAdd(key: string, member: string): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  sRem(key: string, member: string): Promise<number>;

  createSession(session: Omit<UserSession, 'createdAt' | 'lastActivity'>): Promise<string>;
  getSession(sessionId: SessionId): Promise<UserSession | null>;
  updateSession(sessionId: SessionId, updates: Partial<UserSession>): Promise<void>;
  deleteSession(sessionId: SessionId): Promise<void>;
  getUserSessions(userId: UserId): Promise<UserSession[]>;

  close(): Promise<void>;
}


export interface RedisKeyBuilder {
  namespace(ns: string): RedisKeyBuilder;
  type(type: string): RedisKeyBuilder;
  id(id: string): RedisKeyBuilder;
  tag(tag: string): RedisKeyBuilder;
  build(): string;
  reset(): RedisKeyBuilder;
  userKey(userId: UserId): RedisKeyBuilder;
  sessionKey(sessionId: SessionId): RedisKeyBuilder;
  cacheKey(key: string): RedisKeyBuilder;
  logKey(logId: string): RedisKeyBuilder;
}

export interface RedisSerializer {
  serialize<T>(data: T): string;
  deserialize<T>(data: string): T;
  canSerialize(data: any): boolean;
}


export const REDIS_CONSTANTS = {
  DEFAULT_CONNECT_TIMEOUT: 10000,
  DEFAULT_COMMAND_TIMEOUT: 5000,
  DEFAULT_SESSION_TTL: 86400, 
  DEFAULT_CACHE_TTL: 3600,   
  DEFAULT_LOG_TTL: 2592000,   
  MAX_KEY_LENGTH: 512,
  MAX_PIPELINE_SIZE: 1000,
  MAX_BATCH_SIZE: 100,
  CACHE_PREFIX: 'cache',
  SESSION_PREFIX: 'session',
  LOG_PREFIX: 'log',
  WILDCARD: '*',
  SEPARATOR: ':',
} as const;