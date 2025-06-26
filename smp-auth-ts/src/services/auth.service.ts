/**
 * Service d'authentification consolidé - Version simplifiée
 * Orchestrate Keycloak, OPA et Redis pour une API unifiée
 */

import { createHash } from 'crypto';
import { 
  AuthConfig,
  AuthorizationResult
} from '../interface/common.js';
import { 
  IAuthenticationService,
  KeycloakClientExtended,
  AuthResponse,
  TokenValidationResult,
  UserInfo,
  ConnectionTestResult,
  AuthenticationOptions,
  AuthEvent,
  EventCallback,
  AuthEventType,
  ErrorCode,
  UserRegistrationData,
  UserRegistrationResult
} from '../interface/auth.interface.js';
import { 
  OPAClientExtended, 
  OPAInput, 
  OPAResult,
  OPAUser,
  OPAResource,
  OPAContext
} from '../interface/opa.interface.js';
import { 
  RedisClientExtended,
  AuthorizationLog
} from '../interface/redis.interface.js';

import { KeycloakClientImpl } from '../clients/keycloak.client.js';
import { OPAClientImpl } from '../clients/opa.client.js';
import { RedisClientImpl } from '../clients/redis.client.js';
import { loadConfig } from '../config.js';

export class AuthService implements IAuthenticationService {
  private readonly config: AuthConfig;
  private readonly keycloakClient: KeycloakClientExtended;
  private readonly opaClient: OPAClientExtended;
  private readonly redisClient: RedisClientExtended;
  private readonly authOptions: AuthenticationOptions;
  
  // Gestionnaires d'événements
  private eventCallbacks: Map<AuthEventType, EventCallback[]> = new Map();
  
  // Métriques simplifiées
  private metrics = {
    totalRequests: 0,
    successfulLogins: 0,
    failedLogins: 0,
    tokenValidations: 0,
    authorizationChecks: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now()
  };

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
    this.keycloakClient = new KeycloakClientImpl(this.config.keycloak) as KeycloakClientExtended;
    this.opaClient = new OPAClientImpl(this.config.opa) as OPAClientExtended;
    this.redisClient = new RedisClientImpl(this.config.redis) as RedisClientExtended;
    
    this.initializeEventHandlers();
  }

  // ============================================================================
  // MÉTHODES D'AUTHENTIFICATION PRINCIPALES
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
    const startTime = Date.now();
   
    
    try {
      this.metrics.totalRequests++;
      
      // Authentification via Keycloak
      const authResponse = await this.keycloakClient.login!(username, password);
      
      // Émettre l'événement de connexion
      await this.emitEvent({
        type: 'login',
        //userId: userInfo.sub,
        username,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
        //  correlationId,
          sessionId: authResponse.session_id,
          tokenType: authResponse.token_type
        }
      });
      
      this.metrics.successfulLogins++;
      return authResponse;
      
    } catch (error) {
      this.metrics.failedLogins++;
      
      await this.emitEvent({
        type: 'login',
        username,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
       // details: { correlationId }
      });
      
      throw this.enhanceError(error, ErrorCode.INVALID_CREDENTIALS, 'Login failed');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.metrics.totalRequests++;
      
      const authResponse = await this.keycloakClient.refreshToken!(refreshToken);
      
      // Valider le nouveau token et mettre à jour le cache
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
      this.metrics.tokenValidations++;
      
      // Vérifier le cache d'abord
      if (this.authOptions.enableCache) {
        const cached = await this.getCachedTokenValidation(token);
        if (cached) {
          this.metrics.cacheHits++;
          return cached;
        }
        this.metrics.cacheMisses++;
      }
      
      // Validation via Keycloak
      const userInfo = await this.keycloakClient.validateToken(token);
      
      const result: TokenValidationResult = {
        valid: true,
        userId: userInfo.sub,
        email: userInfo.email,
        givenName: userInfo.given_name,
        familyName: userInfo.family_name,
        roles: userInfo.roles
      };
      
      // Mettre en cache le résultat
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

  /**
 * Enregistrement d'un nouvel utilisateur
 */
async registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult> {
  const startTime = Date.now();
  const correlationId = this.generateCorrelationId();
  
  try {
   // this.logger.log(`🔐 Starting user registration for: ${userData.username}`);
    
    // Déléguer vers smp-auth-ts
    const result = await this.keycloakClient.registerUser(userData);
    
    if (result.success && result.userId) {
    //  this.logger.log(`✅ User registered successfully: ${userData.username} (ID: ${result.userId})`);
      
      // Émettre événement de succès
      await this.emitEvent({
        type: 'login', // Utiliser 'login' car 'user_registered' n'existe pas dans AuthEventType
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
    //this.logger.error(`❌ User registration failed for ${userData.username}:`, error.message);
    
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

/**
 * Vérification d'email
 */
async verifyEmail(userId: string, token: string): Promise<boolean> {
  try {
   // this.logger.log(`📧 Verifying email for user: ${userId}`);
    return await this.keycloakClient.verifyEmail(userId, token);
  } catch (error) {
    //this.logger.error(`❌ Email verification failed for user ${userId}:`, error.message);
    return false;
  }
}

/**
 * Renvoyer l'email de vérification
 */
async resendVerificationEmail(userId: string): Promise<boolean> {
 
   return false;

}

/**
 * Demande de reset de mot de passe
 */
async resetPassword(email: string): Promise<boolean> {
  try {
    //this.logger.log(`🔑 Initiating password reset for: ${email}`);
    return await this.keycloakClient.resetPassword(email);
  } catch (error) {
    //this.logger.error(`❌ Password reset failed for ${email}:`, error.message);
    return false;
  }
}

/**
 * Changement de mot de passe
 */
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
      // Récupérer les informations utilisateur avant déconnexion
      let userId: string | undefined;
      try {
        const userInfo = await this.keycloakClient.validateToken(token);
        userId = userInfo.sub;
      } catch {
        // Token déjà invalide, continuer quand même
      }
      
      // Déconnexion via Keycloak
      await this.keycloakClient.logout!(token);
      
      // Nettoyer le cache
      if (this.authOptions.enableCache && userId) {
        await this.invalidateUserCache(userId);
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

  // ============================================================================
  // MÉTHODES DE GESTION DES UTILISATEURS
  // ============================================================================

  async getUserInfo(userId: string): Promise<UserInfo | null> {
    try {
      // Vérifier le cache d'abord
      if (this.authOptions.enableCache) {
        const cached = await this.getCachedUserInfo(userId);
        if (cached) {
          this.metrics.cacheHits++;
          return cached;
        }
        this.metrics.cacheMisses++;
      }
      
      // Récupérer depuis Keycloak
      const userInfo = await this.keycloakClient.getUserInfos(userId);
      
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
      
      // Mettre en cache
      if (this.authOptions.enableCache) {
        await this.cacheUserRoles(userId, roles);
      }
      
      return roles;
      
    } catch (error) {
      console.error(`Failed to get user roles for ${userId}:`, error);
      return [];
    }
  }

  async invalidateUserCache(userId: string): Promise<void> {
    if (!this.authOptions.enableCache) return;
    
    try {
      await this.redisClient.invalidateByPattern(`*:user:${userId}:*`);
      await this.redisClient.invalidateByPattern(`*:token:*:${userId}`);
      
      await this.emitEvent({
        type: 'authorization_check',
        userId,
        success: true,
        timestamp: new Date().toISOString(),
        details: { operation: 'invalidate_user_cache' }
      });
      
    } catch (error) {
      console.error(`Failed to invalidate user cache for ${userId}:`, error);
    }
  }

  // ============================================================================
  // MÉTHODES D'AUTORISATION
  // ============================================================================

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
      this.metrics.authorizationChecks++;
      
      // Valider le token et récupérer les informations utilisateur
      const userInfo = await this.keycloakClient.validateToken(token);
      
      // Vérifier le cache d'autorisation
      if (this.authOptions.enableCache) {
        const cached = await this.getCachedAuthorizationResult(
          userInfo.sub, resourceId, resourceType, action
        );
        if (cached) {
          this.metrics.cacheHits++;
          return { ...cached, cached: true };
        }
        this.metrics.cacheMisses++;
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

  // ============================================================================
  // MÉTHODES DE TEST ET SURVEILLANCE
  // ============================================================================

  async testKeycloakConnection(): Promise<ConnectionTestResult> {
    try {
      return await this.keycloakClient.testConnection();
    } catch (error) {
      return {
        connected: false,
        error: `Keycloak connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async testRedisConnection(): Promise<ConnectionTestResult> {
    try {
      const start = Date.now();
      const pong = await this.redisClient.ping();
      const latency = Date.now() - start;
      
      return {
        connected: true,
        info: `Redis connection successful. Response: ${pong}`,
        latency
      };
    } catch (error) {
      return {
        connected: false,
        error: `Redis connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async testOPAConnection(): Promise<ConnectionTestResult> {
    try {
      const start = Date.now();
      const isHealthy = await this.opaClient.healthCheck();
      const latency = Date.now() - start;
      
      return {
        connected: isHealthy,
        info: isHealthy ? 'OPA connection successful' : 'OPA health check failed',
        latency
      };
    } catch (error) {
      return {
        connected: false,
        error: `OPA connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // ============================================================================
  // MÉTRIQUES ET ÉVÉNEMENTS
  // ============================================================================

  getMetrics(): Record<string, any> {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      requestsPerSecond: this.metrics.totalRequests / (uptime / 1000),
      loginSuccessRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulLogins / (this.metrics.successfulLogins + this.metrics.failedLogins)) * 100 
        : 0,
      cacheHitRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 
        : 0
    };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulLogins: 0,
      failedLogins: 0,
      tokenValidations: 0,
      authorizationChecks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      startTime: Date.now()
    };
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

  // ============================================================================
  // MÉTHODES PRIVÉES UTILITAIRES
  // ============================================================================

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

  // ============================================================================
  // MÉTHODES DE CACHE PRIVÉES
  // ============================================================================

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
      await this.redisClient.invalidateByPattern(`auth:token:*:${tokenHash}`);
    } catch (error) {
      console.error('Failed to invalidate token cache:', error);
    }
  }

  private hashToken(token: string): string {
    return createHash('md5').update(token).digest('hex').substring(0, 16);
  }

  // ============================================================================
  // MÉTHODES DE SESSION PRIVÉES
  // ============================================================================

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

  // ============================================================================
  // FERMETURE
  // ============================================================================

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