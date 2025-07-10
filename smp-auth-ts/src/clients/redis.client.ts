/**
 * Client Redis simplifié avec fonctionnalités essentielles
 */

import { createClient, RedisClientType } from 'redis';
import { 
  RedisConfig, 
  RedisClient,
  RedisOperationOptions,
  CacheEntry,
  CacheOptions,
  CacheStatistics,
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
  private client: RedisClientType;
  private connected: boolean = false;
  private readonly keyPrefix: string;
  private keyBuilder: RedisKeyBuilderImpl;
  private serializer: RedisSerializerImpl;

  constructor(config: RedisConfig) {
    this.config = config;
    this.keyPrefix = config.prefix || '';
    
    this.keyBuilder = new RedisKeyBuilderImpl(this.keyPrefix);
    this.serializer = new RedisSerializerImpl();
    
    this.client = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port,
        connectTimeout: this.config.connectTimeout,
      },
      password: this.config.password,
      database: this.config.db || 0,
      commandsQueueMaxLength: this.config.maxRetriesPerRequest || 3
    }) as RedisClientType;
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('error', (err) => {
      console.error('Erreur Redis:', err);
      this.connected = false;
    });
    
    this.client.on('connect', () => {
      this.connected = true;
      console.log('Redis client connected');
    });
    
    this.client.on('end', () => {
      this.connected = false;
      console.log('Redis client disconnected');
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  private getFullKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  // ============================================================================
  // CONNEXION
  // ============================================================================

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return await this.client.ping();
  }

  async info(): Promise<string> {
    await this.ensureConnected();
    return await this.client.info();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    const startTime = Date.now();
    
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.get(fullKey);

      return result;
    } catch (error) {
      throw error;
    }
  }

  async set(key: string, value: string, options?: RedisOperationOptions): Promise<void> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    
    const setOptions: any = {};
    if (options?.ttl) setOptions.EX = options.ttl;
    if (options?.nx) setOptions.NX = true;
    if (options?.xx) setOptions.XX = true;
    
    await this.client.set(fullKey, value, setOptions);
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    await this.client.del(fullKey);
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    const result = await this.client.exists(fullKey);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    await this.ensureConnected();
    const fullPattern = this.getFullKey(pattern);
    const keys = await this.client.keys(fullPattern);
    
    if (this.keyPrefix) {
      const prefixLength = this.keyPrefix.length + 1;
      return keys.map(key => key.substring(prefixLength));
    }
    
    return keys;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    const result = await this.client.expire(fullKey, seconds);
    return result;
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.ttl(fullKey);
  }

  async getCache<T>(key: string): Promise<CacheEntry<T> | null> {
    const rawData = await this.get(key);
    if (!rawData) return null;
    
    try {
      const cacheEntry = this.serializer.deserialize<CacheEntry<T>>(rawData);
      
      if (new Date(cacheEntry.expiresAt) < new Date()) {
        await this.delete(key);
        return null;
      }
      
      return cacheEntry;
    } catch (error) {
      console.error('Error deserializing cache entry:', error);
      await this.delete(key);
      return null;
    }
  }

  async setCache<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
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
  }

 

  async memoize<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.getCache<T>(key);
    if (cached) {
      return cached.data;
    }
    
    const result = await fn();
    await this.setCache(key, result, options);
    
    return result;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    const result = await this.client.hGet(fullKey, field);
    return result || null;
  }

  async hSet(key: string, field: string, value: string): Promise<void> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    await this.client.hSet(fullKey, field, value);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.hGetAll(fullKey);
  }

  async hDel(key: string, field: string): Promise<void> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    await this.client.hDel(fullKey, field);
  }

  async lPush(key: string, value: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.lPush(fullKey, value);
  }

  async lPop(key: string): Promise<string | null> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.lPop(fullKey);
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.lRange(fullKey, start, stop);
  }

  async lTrim(key: string, start: number, stop: number): Promise<void> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    await this.client.lTrim(fullKey, start, stop);
  }

  async sAdd(key: string, member: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.sAdd(fullKey, member);
  }

  async sMembers(key: string): Promise<string[]> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.sMembers(fullKey);
  }

  async sRem(key: string, member: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.sRem(fullKey, member);
  }

  async zAdd(key: string, score: number, member: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.zAdd(fullKey, { score, value: member });
  }

  async zRange(key: string, start: number, stop: number, options?: { REV?: boolean }): Promise<string[]> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    if (options) {
      return await this.client.zRange(fullKey, start, stop);
    } else {
      return await this.client.zRange(fullKey, start, stop);
    }
  }

  async zRem(key: string, member: string): Promise<number> {
    await this.ensureConnected();
    const fullKey = this.getFullKey(key);
    return await this.client.zRem(fullKey, member);
  }

  async logAuthorizationDecision(log: Omit<AuthorizationLog, 'id' | 'timestamp'>): Promise<void> {
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

  async createSession(session: Omit<UserSession, 'createdAt' | 'lastActivity'>): Promise<string> {
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
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const sessionKey = this.getFullKey(`session:${sessionId}`);
    const serializedSession = await this.get(sessionKey);
    
    if (!serializedSession) return null;
    
    try {
      return this.serializer.deserialize<UserSession>(serializedSession);
    } catch (error) {
      console.error('Error deserializing session:', error);
      await this.delete(sessionKey);
      return null;
    }
  }

  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<void> {
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
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    
    const sessionKey = this.getFullKey(`session:${sessionId}`);
    const userSessionsKey = this.getFullKey(`user:sessions:${session.userId}`);
    
    await this.delete(sessionKey);
    await this.sRem(userSessionsKey, sessionId);
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
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
  }

  async logSessionActivity(activity: Omit<SessionActivity, 'timestamp'>): Promise<void> {
    const activityLog: SessionActivity = {
      ...activity,
      timestamp: new Date().toISOString()
    };
    
    const activityKey = this.getFullKey(`session:activity:${activity.sessionId}`);
    const serializedActivity = this.serializer.serialize(activityLog);
    
    await this.lPush(activityKey, serializedActivity);
    await this.lTrim(activityKey, 0, 99);
    await this.expire(activityKey, 24 * 60 * 60);
  }

  async getSessionActivity(sessionId: string, limit?: number): Promise<SessionActivity[]> {
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
  }


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
    const fullKey = this.getFullKey(key);
    return await this.client.zCard(fullKey);
  }

  private async zRemRangeByRank(key: string, start: number, stop: number): Promise<number> {
    const fullKey = this.getFullKey(key);
    return await this.client.zRemRangeByRank(fullKey, start, stop);
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
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

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