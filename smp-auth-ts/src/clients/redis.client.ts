// smp-auth-ts/src/clients/redis.client.ts - Version corrigée avec singleton
import { createClient, RedisClientType } from 'redis';
import { 
  RedisConfig, 
  RedisClient,
  RedisOperationOptions,
  CacheEntry,
  CacheOptions,
  AuthorizationLog,
  LogFilter,
  LogSearchResult,
  UserSession,
  SessionActivity,
  RedisKeyBuilder,
  RedisSerializer
} from '../interface/redis.interface.js';

export class RedisClientImpl implements RedisClient {
  private readonly config: RedisConfig;
  private static instance: RedisClientType | null = null;
  private static connectionPromise: Promise<void> | null = null;
  private client: RedisClientType;
  private connected: boolean = false;
  private readonly keyPrefix: string;
  private keyBuilder: RedisKeyBuilderImpl;
  private serializer: RedisSerializerImpl;
  private connectionAttempts = 0;
  private readonly maxConnectionAttempts = 3;

  constructor(config: RedisConfig) {
    this.config = config;
    this.keyPrefix = config.prefix || '';
    
    this.keyBuilder = new RedisKeyBuilderImpl(this.keyPrefix);
    this.serializer = new RedisSerializerImpl();
    
    // 🔧 FIX PRINCIPAL: Utiliser un singleton pour éviter les connexions multiples
    if (!RedisClientImpl.instance) {
      RedisClientImpl.instance = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connectTimeout || 10000,
        },
        password: this.config.password,
        database: this.config.db || 0,
        commandsQueueMaxLength: this.config.maxRetriesPerRequest || 3
      }) as RedisClientType;

      this.setupEventHandlers();
    }
    
    this.client = RedisClientImpl.instance;
  }

  private setupEventHandlers(): void {
    if (!RedisClientImpl.instance) return;

    RedisClientImpl.instance.on('error', (err) => {
      console.error('❌ Redis error:', err);
      this.connected = false;
      RedisClientImpl.connectionPromise = null;
    });
    
    RedisClientImpl.instance.on('connect', () => {
      this.connected = true;
      console.log('✅ Redis client connected');
    });
    
    RedisClientImpl.instance.on('ready', () => {
      this.connected = true;
      console.log('✅ Redis client ready');
    });
    
    RedisClientImpl.instance.on('end', () => {
      this.connected = false;
      console.log('🔌 Redis client disconnected');
      RedisClientImpl.connectionPromise = null;
    });

    RedisClientImpl.instance.on('reconnecting', () => {
      console.log('🔄 Redis client reconnecting...');
    });
  }

  private async ensureConnected(): Promise<void> {
    // Si déjà connecté, retourner immédiatement
    if (this.connected && this.client.isReady) {
      return;
    }

    // Si une connexion est en cours, attendre qu'elle se termine
    if (RedisClientImpl.connectionPromise) {
      await RedisClientImpl.connectionPromise;
      return;
    }

    // Créer une nouvelle connexion
    RedisClientImpl.connectionPromise = this.connectWithRetry();
    await RedisClientImpl.connectionPromise;
  }

  private async connectWithRetry(): Promise<void> {
    while (this.connectionAttempts < this.maxConnectionAttempts) {
      try {
        if (!this.client.isOpen) {
          console.log(`🔄 Attempting Redis connection (${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`);
          await this.client.connect();
          this.connected = true;
          this.connectionAttempts = 0; // Reset on successful connection
          console.log('✅ Redis connected successfully');
          return;
        } else {
          this.connected = true;
          return;
        }
      } catch (error) {
        this.connectionAttempts++;
        console.error(`❌ Redis connection attempt ${this.connectionAttempts} failed:`, error);
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
          throw new Error(`Failed to connect to Redis after ${this.maxConnectionAttempts} attempts: ${error}`);
        }
        
        // Attendre avant le prochain essai
        await new Promise(resolve => setTimeout(resolve, 1000 * this.connectionAttempts));
      }
    }
  }

  private getFullKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  // ============================================================================
  // CONNEXION - Version corrigée
  // ============================================================================

  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  async disconnect(): Promise<void> {
    if (this.connected && RedisClientImpl.instance) {
      try {
        await RedisClientImpl.instance.disconnect();
        this.connected = false;
        RedisClientImpl.instance = null;
        RedisClientImpl.connectionPromise = null;
        console.log('✅ Redis disconnected successfully');
      } catch (error) {
        console.error('❌ Error disconnecting Redis:', error);
      }
    }
  }

  isConnected(): boolean {
    return this.connected && this.client?.isReady;
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return await this.client.ping();
  }

  async info(): Promise<string> {
    await this.ensureConnected();
    return await this.client.info();
  }

  // ============================================================================
  // OPÉRATIONS DE BASE - Version avec gestion d'erreur améliorée
  // ============================================================================

  async get(key: string): Promise<string | null> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      const result = await this.client.get(fullKey);
      return result;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, options?: RedisOperationOptions): Promise<void> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      
      const setOptions: any = {};
      if (options?.ttl) setOptions.EX = options.ttl;
      if (options?.nx) setOptions.NX = true;
      if (options?.xx) setOptions.XX = true;
      
      await this.client.set(fullKey, value, setOptions);
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      await this.client.del(fullKey);
    } catch (error) {
      console.error(`Redis DELETE error for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      await this.ensureConnected();
      const fullPattern = this.getFullKey(pattern);
      const keys = await this.client.keys(fullPattern);
      
      if (this.keyPrefix) {
        const prefixLength = this.keyPrefix.length + 1;
        return keys.map(key => key.substring(prefixLength));
      }
      
      return keys;
    } catch (error) {
      console.error(`Redis KEYS error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      const result = await this.client.expire(fullKey, seconds);
      return result;
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.ttl(fullKey);
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // ============================================================================
  // MÉTHODES DE CACHE - Inchangées mais avec meilleure gestion d'erreur
  // ============================================================================

  async getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const rawData = await this.get(key);
      if (!rawData) return null;
      
      const cacheEntry = this.serializer.deserialize<CacheEntry<T>>(rawData);
      
      if (new Date(cacheEntry.expiresAt) < new Date()) {
        await this.delete(key);
        return null;
      }
      
      return cacheEntry;
    } catch (error) {
      console.error('Error deserializing cache entry:', error);
      await this.delete(key).catch(() => {}); // Ignore delete errors
      return null;
    }
  }

  async setCache<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    try {
      const now = new Date();
      const ttl = options?.ttl || 3600;
      const expiresAt = new Date(now.getTime() + (ttl * 1000));
      
      const cacheEntry: CacheEntry<T> = {
        data,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        version: options?.version,
        metadata: options ? {
          tags: options.tags,
          namespace: options.namespace
        } : undefined
      };
      
      const serializedData = this.serializer.serialize(cacheEntry);
      await this.set(key, serializedData, { ttl });
      
      // Gérer les tags pour l'invalidation groupée
      if (options?.tags) {
        for (const tag of options.tags) {
          await this.sAdd(`cache:tags:${tag}`, key);
          await this.expire(`cache:tags:${tag}`, ttl);
        }
      }
    } catch (error) {
      console.error('Error setting cache entry:', error);
      throw error;
    }
  }

  async memoize<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    try {
      const cached = await this.getCache<T>(key);
      if (cached) {
        return cached.data;
      }
      
      const result = await fn();
      await this.setCache(key, result, options);
      
      return result;
    } catch (error) {
      console.error('Error in memoize:', error);
      // En cas d'erreur de cache, exécuter la fonction directement
      return await fn();
    }
  }

  // ============================================================================
  // AUTRES MÉTHODES - Hash, List, Set, etc. (inchangées mais avec gestion d'erreur)
  // ============================================================================

  async hGet(key: string, field: string): Promise<string | null> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      const result = await this.client.hGet(fullKey, field);
      return result || null;
    } catch (error) {
      console.error(`Redis HGET error for ${key}.${field}:`, error);
      return null;
    }
  }

  async hSet(key: string, field: string, value: string): Promise<void> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      await this.client.hSet(fullKey, field, value);
    } catch (error) {
      console.error(`Redis HSET error for ${key}.${field}:`, error);
      throw error;
    }
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.hGetAll(fullKey);
    } catch (error) {
      console.error(`Redis HGETALL error for ${key}:`, error);
      return {};
    }
  }

  async hDel(key: string, field: string): Promise<void> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      await this.client.hDel(fullKey, field);
    } catch (error) {
      console.error(`Redis HDEL error for ${key}.${field}:`, error);
    }
  }

  // Lists
  async lPush(key: string, value: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.lPush(fullKey, value);
    } catch (error) {
      console.error(`Redis LPUSH error for ${key}:`, error);
      return 0;
    }
  }

  async lPop(key: string): Promise<string | null> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.lPop(fullKey);
    } catch (error) {
      console.error(`Redis LPOP error for ${key}:`, error);
      return null;
    }
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.lRange(fullKey, start, stop);
    } catch (error) {
      console.error(`Redis LRANGE error for ${key}:`, error);
      return [];
    }
  }

  async lTrim(key: string, start: number, stop: number): Promise<void> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      await this.client.lTrim(fullKey, start, stop);
    } catch (error) {
      console.error(`Redis LTRIM error for ${key}:`, error);
    }
  }

  // Sets
  async sAdd(key: string, member: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.sAdd(fullKey, member);
    } catch (error) {
      console.error(`Redis SADD error for ${key}:`, error);
      return 0;
    }
  }

  async sMembers(key: string): Promise<string[]> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.sMembers(fullKey);
    } catch (error) {
      console.error(`Redis SMEMBERS error for ${key}:`, error);
      return [];
    }
  }

  async sRem(key: string, member: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.sRem(fullKey, member);
    } catch (error) {
      console.error(`Redis SREM error for ${key}:`, error);
      return 0;
    }
  }

  // Sorted Sets
  async zAdd(key: string, score: number, member: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.zAdd(fullKey, { score, value: member });
    } catch (error) {
      console.error(`Redis ZADD error for ${key}:`, error);
      return 0;
    }
  }

  async zRange(key: string, start: number, stop: number, options?: { REV?: boolean }): Promise<string[]> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.zRange(fullKey, start, stop);
    } catch (error) {
      console.error(`Redis ZRANGE error for ${key}:`, error);
      return [];
    }
  }

  async zRem(key: string, member: string): Promise<number> {
    try {
      await this.ensureConnected();
      const fullKey = this.getFullKey(key);
      return await this.client.zRem(fullKey, member);
    } catch (error) {
      console.error(`Redis ZREM error for ${key}:`, error);
      return 0;
    }
  }

  // ============================================================================
  // MÉTHODES SPÉCIALISÉES - Logs, Sessions (inchangées)
  // ============================================================================

  async logAuthorizationDecision(log: Omit<AuthorizationLog, 'id' | 'timestamp'>): Promise<void> {
    // ... (reste du code inchangé)
    await this.ensureConnected();
    
    const logEntry: AuthorizationLog = {
      ...log,
      id: this.generateId(),
      timestamp: new Date().toISOString()
    };
    
    const logKey = this.getFullKey(`auth:log:${logEntry.id}`);
    const serializedLog = this.serializer.serialize(logEntry);
    
    await this.set(logKey, serializedLog, { ttl: 30 * 24 * 60 * 60 });
    
    // Ajouter aux index pour recherche
    await this.zAdd(`auth:logs:user:${log.userId}`, Date.now(), logEntry.id);
    await this.zAdd(`auth:logs:resource:${log.resourceId}`, Date.now(), logEntry.id);
    await this.zAdd(`auth:logs:global`, Date.now(), logEntry.id);
    
    // Limiter la taille des index
    await this.zRemRangeByRank(`auth:logs:user:${log.userId}`, 0, -1001);
    await this.zRemRangeByRank(`auth:logs:resource:${log.resourceId}`, 0, -1001);
    await this.zRemRangeByRank(`auth:logs:global`, 0, -10001);
  }

  async getAuthorizationHistory(filter: LogFilter): Promise<LogSearchResult> {
    // ... (reste du code inchangé)
    const startTime = Date.now();
    await this.ensureConnected();
    
    let indexKey: string;
    if (filter.userId) {
      indexKey = `auth:logs:user:${filter.userId}`;
    } else if (filter.resourceId) {
      indexKey = `auth:logs:resource:${filter.resourceId}`;
    } else {
      indexKey = `auth:logs:global`;
    }
    
    const limit = filter.limit || 100;
    const offset = filter.offset || 0;
    const sortOrder = filter.sortOrder === 'asc' ? false : true;
    
    const logIds = await this.zRange(
      indexKey, 
      offset, 
      offset + limit - 1, 
      { REV: sortOrder }
    );
    
    const logs: AuthorizationLog[] = [];
    for (const logId of logIds) {
      const logKey = this.getFullKey(`auth:log:${logId}`);
      const serializedLog = await this.get(logKey);
      
      if (serializedLog) {
        try {
          const log = this.serializer.deserialize<AuthorizationLog>(serializedLog);
          
          if (this.matchesFilter(log, filter)) {
            logs.push(log);
          }
        } catch (error) {
          console.error('Error deserializing log:', error);
        }
      }
    }
    
    const totalCount = await this.zCard(indexKey);
    
    return {
      items: logs,
      totalCount,
      hasMore: offset + logs.length < totalCount,
      pagination: {
        limit,
        offset
      },
      searchTime: Date.now() - startTime
    };
  }

  // Méthodes de session (inchangées mais avec gestion d'erreur)
  async createSession(session: Omit<UserSession, 'createdAt' | 'lastActivity'>): Promise<string> {
    try {
      await this.ensureConnected();
      
      const now = new Date().toISOString();
      const fullSession: UserSession = {
        ...session,
        createdAt: now,
        lastActivity: now
      };
      
      const sessionKey = this.getFullKey(`session:${session.sessionId}`);
      const userSessionsKey = this.getFullKey(`user:sessions:${session.userId}`);
      
      const serializedSession = this.serializer.serialize(fullSession);
      await this.set(sessionKey, serializedSession, { ttl: 24 * 60 * 60 });
      
      await this.sAdd(userSessionsKey, session.sessionId);
      
      return session.sessionId;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = this.getFullKey(`session:${sessionId}`);
      const serializedSession = await this.get(sessionKey);
      
      if (!serializedSession) return null;
      
      return this.serializer.deserialize<UserSession>(serializedSession);
    } catch (error) {
      console.error('Error deserializing session:', error);
      const sessionKey = this.getFullKey(`session:${sessionId}`);
      await this.delete(sessionKey).catch(() => {});
      return null;
    }
  }

  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;
      
      const updatedSession: UserSession = {
        ...session,
        ...updates,
        lastActivity: new Date().toISOString()
      };
      
      const sessionKey = this.getFullKey(`session:${sessionId}`);
      const serializedSession = this.serializer.serialize(updatedSession);
      await this.set(sessionKey, serializedSession, { ttl: 24 * 60 * 60 });
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;
      
      const sessionKey = this.getFullKey(`session:${sessionId}`);
      const userSessionsKey = this.getFullKey(`user:sessions:${session.userId}`);
      
      await this.delete(sessionKey);
      await this.sRem(userSessionsKey, sessionId);
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    try {
      const userSessionsKey = this.getFullKey(`user:sessions:${userId}`);
      const sessionIds = await this.sMembers(userSessionsKey);
      
      const sessions: UserSession[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        } else {
          await this.sRem(userSessionsKey, sessionId);
        }
      }
      
      return sessions;
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  async logSessionActivity(activity: Omit<SessionActivity, 'timestamp'>): Promise<void> {
    try {
      const activityLog: SessionActivity = {
        ...activity,
        timestamp: new Date().toISOString()
      };
      
      const activityKey = this.getFullKey(`session:activity:${activity.sessionId}`);
      const serializedActivity = this.serializer.serialize(activityLog);
      
      await this.lPush(activityKey, serializedActivity);
      await this.lTrim(activityKey, 0, 99);
      await this.expire(activityKey, 24 * 60 * 60);
    } catch (error) {
      console.error('Error logging session activity:', error);
    }
  }

  async getSessionActivity(sessionId: string, limit?: number): Promise<SessionActivity[]> {
    try {
      const activityKey = this.getFullKey(`session:activity:${sessionId}`);
      const serializedActivities = await this.lRange(activityKey, 0, (limit || 100) - 1);
      
      const activities: SessionActivity[] = [];
      for (const serialized of serializedActivities) {
        try {
          activities.push(this.serializer.deserialize<SessionActivity>(serialized));
        } catch (error) {
          console.error('Error deserializing session activity:', error);
        }
      }
      
      return activities;
    } catch (error) {
      console.error('Error getting session activity:', error);
      return [];
    }
  }

  // ============================================================================
  // GETTERS ET UTILITAIRES
  // ============================================================================

  getKeyBuilder(): RedisKeyBuilder {
    return this.keyBuilder;
  }

  getSerializer(): RedisSerializer {
    return this.serializer;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async zCard(key: string): Promise<number> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.client.zCard(fullKey);
    } catch (error) {
      console.error(`Redis ZCARD error for ${key}:`, error);
      return 0;
    }
  }

  private async zRemRangeByRank(key: string, start: number, stop: number): Promise<number> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.client.zRemRangeByRank(fullKey, start, stop);
    } catch (error) {
      console.error(`Redis ZREMRANGEBYRANK error for ${key}:`, error);
      return 0;
    }
  }

  private matchesFilter(log: AuthorizationLog, filter: LogFilter): boolean {
    if (filter.resourceType && log.resourceType !== filter.resourceType) return false;
    if (filter.action && log.action !== filter.action) return false;
    if (filter.allowed !== undefined && log.allowed !== filter.allowed) return false;
    if (filter.dateFrom && log.timestamp < filter.dateFrom) return false;
    if (filter.dateTo && log.timestamp > filter.dateTo) return false;
    
    return true;
  }

  async close(): Promise<void> {
    try {
      if (this.connected && RedisClientImpl.instance) {
        await RedisClientImpl.instance.quit();
        this.connected = false;
        RedisClientImpl.instance = null;
        RedisClientImpl.connectionPromise = null;
        console.log('✅ Redis connection closed gracefully');
      }
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error);
    }
  }
}

// Classes utilitaires inchangées
class RedisKeyBuilderImpl implements RedisKeyBuilder {
  private parts: string[] = [];
  
  constructor(private prefix?: string) {
    if (prefix) this.parts.push(prefix);
  }

  namespace(ns: string): RedisKeyBuilder {
    this.parts.push(ns);
    return this;
  }

  type(type: string): RedisKeyBuilder {
    this.parts.push(type);
    return this;
  }

  id(id: string): RedisKeyBuilder {
    this.parts.push(id);
    return this;
  }

  tag(tag: string): RedisKeyBuilder {
    this.parts.push(`tag:${tag}`);
    return this;
  }

  userKey(userId: string): RedisKeyBuilder {
    this.parts.push('user', userId);
    return this;
  }

  sessionKey(sessionId: string): RedisKeyBuilder {
    this.parts.push('session', sessionId);
    return this;
  }

  cacheKey(key: string): RedisKeyBuilder {
    this.parts.push('cache', key);
    return this;
  }

  logKey(logId: string): RedisKeyBuilder {
    this.parts.push('log', logId);
    return this;
  }

  build(): string {
    return this.parts.join(':');
  }

  reset(): RedisKeyBuilder {
    this.parts = this.prefix ? [this.prefix] : [];
    return this;
  }
}

class RedisSerializerImpl implements RedisSerializer {
  serialize<T>(data: T): string {
    return JSON.stringify(data);
  }

  deserialize<T>(data: string): T {
    return JSON.parse(data);
  }

  canSerialize(data: any): boolean {
    try {
      JSON.stringify(data);
      return true;
    } catch {
      return false;
    }
  }
}