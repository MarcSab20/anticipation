import { createHash } from 'crypto';
import { 
  AuthConfig,
  AuthorizationResult
} from '../interface/common.js';
import { 
  IAuthenticationService,
  KeycloakClient,
  AuthResponse,
  TokenValidationResult,
  UserInfo,
  AuthenticationOptions,
  AuthEvent,
  EventCallback,
  AuthEventType,
  ErrorCode,
  UserRegistrationData,
  UserRegistrationResult
} from '../interface/auth.interface.js';
import { 
  OPAClient, 
  OPAInput, 
  OPAResult,
  OPAUser,
  OPAResource,
  OPAContext
} from '../interface/opa.interface.js';
import { 
  RedisClient,
  AuthorizationLog
} from '../interface/redis.interface.js';

import { KeycloakClientImpl } from '../clients/keycloak.client.js';
import { OPAClientImpl } from '../clients/opa.client.js';
import { RedisClientImpl } from '../clients/redis.client.js';
import { loadConfig } from '../config.js';

export class AuthService implements IAuthenticationService {
  private readonly config: AuthConfig;
  private readonly keycloakClient: KeycloakClient;
  private readonly opaClient: OPAClient;
  private readonly redisClient: RedisClient;
  private readonly authOptions: AuthenticationOptions;
  
  // Gestionnaires d'événements
  private eventCallbacks: Map<AuthEventType, EventCallback[]> = new Map();
  

  constructor(config?: AuthConfig, options?: AuthenticationOptions) {
    this.config = config || loadConfig();
    this.authOptions = {
      enableCache: true,
      cacheExpiry: 3600,
      enableLogging: true,
      enableSessionTracking: true,
      maxSessions: 5,
      tokenValidationStrategy: 'introspection',
      ...options
    };
    
    // Initialiser les clients
    this.keycloakClient = new KeycloakClientImpl(this.config.keycloak) as KeycloakClient;
    this.opaClient = new OPAClientImpl(this.config.opa) as OPAClient;
    this.redisClient = new RedisClientImpl(this.config.redis) as RedisClient;
    
    this.initializeEventHandlers();
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const startTime = Date.now();

    try {

      const authResponse = await this.keycloakClient.login!(username, password);

      await this.emitEvent({
        type: 'login',
        username,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          sessionId: authResponse.session_id,
          tokenType: authResponse.token_type
        }
      });
      return authResponse;
      
    } catch (error) {
      
      await this.emitEvent({
        type: 'login',
        username,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw this.enhanceError(error, ErrorCode.INVALID_CREDENTIALS, 'Login failed');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      
      const authResponse = await this.keycloakClient.refreshToken!(refreshToken);
      const userInfo = await this.keycloakClient.validateToken(authResponse.access_token);
      
      if (this.authOptions.enableCache) {
        await this.cacheUserInfo(userInfo.sub, userInfo);
      }
      
      await this.emitEvent({
        type: 'token_refresh',
        userId: userInfo.sub,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { correlationId }
      });
      
      return authResponse;
      
    } catch (error) {
      await this.emitEvent({
        type: 'token_refresh',
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: { correlationId }
      });
      
      throw this.enhanceError(error, ErrorCode.TOKEN_INVALID, 'Token refresh failed');
    }
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      
      if (this.authOptions.enableCache) {
        const cached = await this.getCachedTokenValidation(token);
        if (cached) {
          return cached;
        }
      }
      
      const userInfo = await this.keycloakClient.validateToken(token);
      
      const result: TokenValidationResult = {
        valid: true,
        userId: userInfo.sub,
        email: userInfo.email,
        givenName: userInfo.given_name,
        familyName: userInfo.family_name,
        roles: userInfo.roles
      };
      
      if (this.authOptions.enableCache) {
        await this.cacheTokenValidation(token, result);
      }
      
      await this.emitEvent({
        type: 'token_validation',
        userId: userInfo.sub,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { correlationId, cached: false }
      });
      
      return result;
      
    } catch (error) {
      await this.emitEvent({
        type: 'token_validation',
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: { correlationId }
      });
      
      return { valid: false };
    }
  }

async registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult> {
  const startTime = Date.now();
  const correlationId = this.generateCorrelationId();
  
  try {
    const result = await this.keycloakClient.registerUser(userData);
    
    if (result.success && result.userId) {

      await this.emitEvent({
        type: 'login', 
        userId: result.userId,
        username: userData.username,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          correlationId,
          email: userData.email,
          operation: 'user_registration'
        }
      });
    }
    return result;
  } catch (error) {
    await this.emitEvent({
      type: 'error',
      username: userData.username,
      success: false,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      details: {
        correlationId,
        operation: 'user_registration'
      }
    });
    
    return {
      success: false,
      message: 'Registration failed due to system error',
      errors: ['SYSTEM_ERROR']
    };
  }
}

async verifyEmail(userId: string, token: string): Promise<boolean> {
  try {
    return await this.keycloakClient.verifyEmail(userId, token);
  } catch (error) {
    return false;
  }
}

async resendVerificationEmail(userId: string): Promise<boolean> {
   return false;
}

async resetPassword(email: string): Promise<boolean> {
  try {
    return await this.keycloakClient.resetPassword(email);
  } catch (error) {
    return false;
  }
}

async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
  try {
    return await this.keycloakClient.changePassword(userId, oldPassword, newPassword);
  } catch (error) {
    return false;
  }
}

  async getClientCredentialsToken(): Promise<AuthResponse> {
    try {
      return await this.keycloakClient.getClientCredentialsToken!();
    } catch (error) {
      throw this.enhanceError(error, ErrorCode.SERVICE_UNAVAILABLE, 'Client credentials token failed');
    }
  }

  async logout(token: string): Promise<void> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      let userId: string | undefined;
      try {
        const userInfo = await this.keycloakClient.validateToken(token);
        userId = userInfo.sub;
      } catch {
        // Token déjà invalide
      }
      
      // Déconnexion via Keycloak
      await this.keycloakClient.logout!(token);
      
      // Nettoyer le cache
      if (this.authOptions.enableCache && userId) {
        await this.invalidateTokenCache(token);
      }
      
      // Fermer les sessions actives
      if (this.authOptions.enableSessionTracking && userId) {
        await this.closeUserSessions(userId);
      }
      
      await this.emitEvent({
        type: 'logout',
        userId,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: { correlationId }
      });
      
    } catch (error) {
      await this.emitEvent({
        type: 'logout',
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: { correlationId }
      });
      
      throw this.enhanceError(error, ErrorCode.SERVICE_UNAVAILABLE, 'Logout failed');
    }
  }

  async getUserInfo(userId: string): Promise<UserInfo | null> {
  try {
    // Vérifier le cache d'abord
    if (this.authOptions.enableCache) {
      const cached = await this.getCachedUserInfo(userId);
      if (cached) {
        return cached;
      }
    }

    const userInfo = await this.keycloakClient.getUserInfo(userId);
    
    // Mettre en cache
    if (this.authOptions.enableCache && userInfo) {
      await this.cacheUserInfo(userId, userInfo);
    }
    
    return userInfo;
    
  } catch (error) {
    console.error(`Failed to get user info for ${userId}:`, error);
    return null;
  }
}

  async getUserRoles(userId: string): Promise<string[]> {
    try {
      // Vérifier le cache
      if (this.authOptions.enableCache) {
        const cached = await this.getCachedUserRoles(userId);
        if (cached) {
          return cached;
        }
      }
      
      const roles = await this.keycloakClient.getRoles(userId);
      
      if (this.authOptions.enableCache) {
        await this.cacheUserRoles(userId, roles);
      }
      
      return roles;
      
    } catch (error) {
      console.error(`Failed to get user roles for ${userId}:`, error);
      return [];
    }
  }

  async checkPermission(
    token: string, 
    resourceId: string, 
    resourceType: string, 
    action: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    const result = await this.checkPermissionDetailed(token, resourceId, resourceType, action, context);
    return result.allowed;
  }

  async checkPermissionDetailed(
    token: string,
    resourceId: string,
    resourceType: string,
    action: string,
    context?: Record<string, any>
  ): Promise<AuthorizationResult> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      const userInfo = await this.keycloakClient.validateToken(token);

      if (this.authOptions.enableCache) {
        const cached = await this.getCachedAuthorizationResult(
          userInfo.sub, resourceId, resourceType, action
        );
        if (cached) {
          return { ...cached, cached: true };
        }
      }
      
      // Construire l'entrée OPA
      const opaInput: OPAInput = {
        user: this.mapUserInfoToOPAUser(userInfo),
        resource: this.buildOPAResource(resourceId, resourceType),
        action,
        context: this.buildOPAContext(context)
      };
      
      // Évaluer avec OPA
      const opaResult = await this.opaClient.checkPermission(opaInput);
      
      const result: AuthorizationResult = {
        allowed: opaResult.allow,
        reason: opaResult.reason,
        timestamp: new Date().toISOString()
      };
      
      // Mettre en cache le résultat
      if (this.authOptions.enableCache) {
        await this.cacheAuthorizationResult(
          userInfo.sub, resourceId, resourceType, action, result
        );
      }
      
      // Journaliser la décision
      await this.logAuthorizationDecision({
        userId: userInfo.sub,
        resourceId,
        resourceType,
        action,
        allowed: result.allowed,
        reason: result.reason,
        context,
        evaluationTime: Date.now() - startTime,
        correlationId
      });
      
      await this.emitEvent({
        type: 'authorization_check',
        userId: userInfo.sub,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          correlationId,
          resourceId,
          resourceType,
          action,
          allowed: result.allowed,
          reason: result.reason
        }
      });
      
      return result;
      
    } catch (error) {
      await this.emitEvent({
        type: 'authorization_check',
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        details: {
          correlationId,
          resourceId,
          resourceType,
          action
        }
      });
      
      // En cas d'erreur, refuser par sécurité
      return {
        allowed: false,
        reason: 'Authorization check failed due to system error',
        timestamp: new Date().toISOString()
      };
    }
  }


  addEventListener(eventType: AuthEventType, callback: EventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  removeEventListener(eventType: AuthEventType, callback: EventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private initializeEventHandlers(): void {
    this.addEventListener('error', async (event: AuthEvent) => {
      console.error(`Auth service error [${event.type}]:`, event.error);
    });
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private enhanceError(error: any, code: ErrorCode, message: string): Error {
    const enhancedError = new Error(`${message}: ${error.message || error}`);
    (enhancedError as any).code = code;
    (enhancedError as any).originalError = error;
    return enhancedError;
  }

  private buildCacheKey(userId: string, resourceId: string, resourceType: string, action: string): string {
    const data = { userId, resourceId, resourceType, action };
    return `auth:authz:${createHash('md5').update(JSON.stringify(data)).digest('hex')}`;
  }

  private mapUserInfoToOPAUser(userInfo: UserInfo): OPAUser {
    return {
      id: userInfo.sub,
      roles: userInfo.roles,
      organization_ids: userInfo.organization_ids,
      state: userInfo.state,
      attributes: userInfo.attributes
    };
  }

  private buildOPAResource(resourceId: string, resourceType: string): OPAResource {
    return {
      id: resourceId,
      type: resourceType,
      attributes: {}
    };
  }

  private buildOPAContext(context?: Record<string, any>): OPAContext {
    return {
      currentDate: new Date().toISOString(),
      businessHours: this.isBusinessHours(),
      ...context
    };
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Lundi à vendredi, 9h-18h
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }

  private async getCachedTokenValidation(token: string): Promise<TokenValidationResult | null> {
    if (!this.authOptions.enableCache) return null;
    
    const tokenHash = this.hashToken(token);
    const cacheKey = `auth:token:validation:${tokenHash}`;
    
    try {
      const cached = await this.redisClient.getCache<TokenValidationResult>(cacheKey);
      return cached?.data || null;
    } catch {
      return null;
    }
  }

  private async cacheTokenValidation(token: string, result: TokenValidationResult): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    const tokenHash = this.hashToken(token);
    const cacheKey = `auth:token:validation:${tokenHash}`;
    
    try {
      await this.redisClient.setCache(cacheKey, result, {
        ttl: this.authOptions.cacheExpiry,
        tags: ['token_validation', `user:${result.userId}`]
      });
    } catch (error) {
      console.error('Failed to cache token validation:', error);
    }
  }

  private async getCachedUserInfo(userId: string): Promise<UserInfo | null> {
    if (!this.authOptions.enableCache) return null;
    
    try {
      const cached = await this.redisClient.getCache<UserInfo>(`auth:user:info:${userId}`);
      return cached?.data || null;
    } catch {
      return null;
    }
  }

  private async cacheUserInfo(userId: string, userInfo: UserInfo): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    try {
      await this.redisClient.setCache(`auth:user:info:${userId}`, userInfo, {
        ttl: this.authOptions.cacheExpiry,
        tags: ['user_info', `user:${userId}`]
      });
    } catch (error) {
      console.error('Failed to cache user info:', error);
    }
  }

  private async getCachedUserRoles(userId: string): Promise<string[] | null> {
    if (!this.authOptions.enableCache) return null;
    
    try {
      const cached = await this.redisClient.getCache<string[]>(`auth:user:roles:${userId}`);
      return cached?.data || null;
    } catch {
      return null;
    }
  }

  private async cacheUserRoles(userId: string, roles: string[]): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    try {
      await this.redisClient.setCache(`auth:user:roles:${userId}`, roles, {
        ttl: this.authOptions.cacheExpiry,
        tags: ['user_roles', `user:${userId}`]
      });
    } catch (error) {
      console.error('Failed to cache user roles:', error);
    }
  }

  private async getCachedAuthorizationResult(
    userId: string, 
    resourceId: string, 
    resourceType: string, 
    action: string
  ): Promise<AuthorizationResult | null> {
    if (!this.authOptions.enableCache) return null;
    
    const cacheKey = this.buildCacheKey(userId, resourceId, resourceType, action);
    
    try {
      const cached = await this.redisClient.getCache<AuthorizationResult>(cacheKey);
      return cached?.data || null;
    } catch {
      return null;
    }
  }

  private async cacheAuthorizationResult(
    userId: string,
    resourceId: string,
    resourceType: string,
    action: string,
    result: AuthorizationResult
  ): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    const cacheKey = this.buildCacheKey(userId, resourceId, resourceType, action);
    
    try {
      await this.redisClient.setCache(cacheKey, result, {
        ttl: Math.min(this.authOptions.cacheExpiry || 3600, 300), // Max 5 minutes pour les autorisations
        tags: ['authorization', `user:${userId}`, `resource:${resourceId}`]
      });
    } catch (error) {
      console.error('Failed to cache authorization result:', error);
    }
  }

  private async invalidateTokenCache(token: string): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    const tokenHash = this.hashToken(token);
    
    try {
    } catch (error) {
      console.error('Failed to invalidate token cache:', error);
    }
  }

  private hashToken(token: string): string {
    return createHash('md5').update(token).digest('hex').substring(0, 16);
  }

  private async createUserSession(
    userId: string, 
    sessionId: string, 
    metadata: Record<string, any>
  ): Promise<void> {
    if (!this.authOptions.enableSessionTracking) return;
    
    try {
      const session = {
        sessionId,
        userId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
        active: true,
        metadata
      };
      
      await this.redisClient.createSession(session);
    } catch (error) {
      console.error('Failed to create user session:', error);
    }
  }

  private async closeUserSessions(userId: string): Promise<void> {
    if (!this.authOptions.enableSessionTracking) return;
    
    try {
      const sessions = await this.redisClient.getUserSessions(userId);
      
      for (const session of sessions) {
        await this.redisClient.deleteSession(session.sessionId);
      }
    } catch (error) {
      console.error('Failed to close user sessions:', error);
    }
  }

  private async logAuthorizationDecision(
    log: Omit<AuthorizationLog, 'id' | 'timestamp'> & { 
      evaluationTime?: number;
      correlationId?: string;
    }
  ): Promise<void> {
    try {
      await this.redisClient.logAuthorizationDecision(log);
    } catch (error) {
      console.error('Failed to log authorization decision:', error);
    }
  }

  private async emitEvent(event: Omit<AuthEvent, 'id'>): Promise<void> {
    const fullEvent: AuthEvent = {
      ...event,
      id: this.generateCorrelationId()
    };
    
    const callbacks = this.eventCallbacks.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          await callback(fullEvent);
        } catch (error) {
          console.error(`Event callback error for ${event.type}:`, error);
        }
      }
    }
    
    // Journaliser l'événement si activé
    if (this.authOptions.enableLogging) {
      try {
        await this.redisClient.set(
          `auth:events:${fullEvent.id}`,
          JSON.stringify(fullEvent),
          { ttl: 7 * 24 * 60 * 60 } // 7 jours
        );
      } catch (error) {
        console.error('Failed to log event:', error);
      }
    }
  }

  async close(): Promise<void> {
    try {
      await Promise.all([
        this.keycloakClient.close(),
        this.opaClient.close(),
        this.redisClient.close()
      ]);
      console.log('AuthService closed successfully');
    } catch (error) {
      console.error('Error closing AuthService:', error);
    }
  }
}