// mu-auth/src/auth/auth.service.ts - Version avec debugging amélioré
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  createAuthService,
  IAuthenticationService,
  AuthConfig,
  AuthenticationOptions,
  AuthResponse,
  TokenValidationResult,
  UserInfo,
  ConnectionTestResult,
  AuthEvent,
  AuthEventType,
  EventCallback
} from 'smp-auth-ts';

import { PostgresUserService } from './services/postgres-user.service';
import { EventLoggerService } from './services/event-logger.service';
import { 
  ExtendedUserInfo, 
  ExtendedEnrichedTokenValidationResult,
  TypeMappers,
  LOCAL_EVENT_TYPES
} from '../common/types/auth-extended.types';

/**
 * Service d'authentification NestJS qui encapsule smp-auth-ts
 * Version avec debugging amélioré et gestion d'erreurs robuste
 */
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private authService: IAuthenticationService;
  private isInitialized = false;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly postgresUserService: PostgresUserService,
    private readonly eventLogger: EventLoggerService
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('🔄 Initializing AuthService with smp-auth-ts...');
      
      // Configuration pour smp-auth-ts avec valeurs par défaut robustes
      const authConfig: AuthConfig = {
        keycloak: {
          url: this.configService.get<string>('KEYCLOAK_URL', 'http://localhost:8080'),
          realm: this.configService.get<string>('KEYCLOAK_REALM', 'mu-realm'),
          clientId: this.configService.get<string>('KEYCLOAK_CLIENT_ID', 'mu-client'),
          clientSecret: this.configService.get<string>('KEYCLOAK_CLIENT_SECRET', ''),
          timeout: parseInt(this.configService.get<string>('KEYCLOAK_TIMEOUT', '10000')),
          adminClientId: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID'),
          adminClientSecret: this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET'),
          enableCache: this.configService.get<boolean>('ENABLE_KEYCLOAK_CACHE', true),
          cacheExpiry: parseInt(this.configService.get<string>('KEYCLOAK_CACHE_EXPIRY', '3600'))
        },
        opa: {
          url: this.configService.get<string>('OPA_URL', 'http://localhost:8181'),
          policyPath: this.configService.get<string>('OPA_POLICY_PATH', '/v1/data/authz/decision'),
          timeout: parseInt(this.configService.get<string>('OPA_TIMEOUT', '5000'))
        },
        redis: {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(this.configService.get<string>('REDIS_PORT', '6379')),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          db: parseInt(this.configService.get<string>('REDIS_DB', '0')),
          prefix: this.configService.get<string>('REDIS_PREFIX', 'mu:auth:')
        }
      };

      const authOptions: AuthenticationOptions = {
        enableCache: this.configService.get<boolean>('ENABLE_AUTH_CACHE', true),
        cacheExpiry: parseInt(this.configService.get<string>('AUTH_CACHE_EXPIRY', '3600')),
        enableLogging: this.configService.get<boolean>('ENABLE_AUTH_LOGGING', true),
        enableSessionTracking: this.configService.get<boolean>('ENABLE_SESSION_TRACKING', true),
        maxSessions: parseInt(this.configService.get<string>('MAX_USER_SESSIONS', '5')),
        tokenValidationStrategy: this.configService.get<'introspection' | 'jwt_decode' | 'userinfo'>('TOKEN_VALIDATION_STRATEGY', 'introspection'),
        development: {
          enableDebugLogging: this.configService.get<string>('NODE_ENV') === 'development',
          mockMode: this.configService.get<boolean>('AUTH_MOCK_MODE', false),
          bypassAuthentication: this.configService.get<boolean>('AUTH_BYPASS', false)
        }
      };

      // Log de la configuration (sans secrets)
      this.logger.debug('Configuration smp-auth-ts:', {
        keycloak: {
          url: authConfig.keycloak.url,
          realm: authConfig.keycloak.realm,
          clientId: authConfig.keycloak.clientId,
          clientSecret: authConfig.keycloak.clientSecret ? '***' : 'NOT_SET'
        },
        opa: authConfig.opa,
        redis: {
          ...authConfig.redis,
          password: authConfig.redis.password ? '***' : 'NOT_SET'
        },
        options: authOptions
      });

      // Test de connectivité avant initialisation
      await this.testExternalServices(authConfig);

      // Créer le service d'authentification
      this.authService = createAuthService(authConfig, authOptions);

      // Configurer les gestionnaires d'événements
      this.setupEventHandlers();

      this.isInitialized = true;
      this.logger.log('✅ AuthService initialized successfully with smp-auth-ts');
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize AuthService:', error.message);
      this.logger.warn('🔄 Falling back to mock mode for development');
      
      // Fallback en mode mock pour le développement
      this.authService = this.createMockAuthService();
      this.isInitialized = true;
    }
  }

  async onModuleDestroy() {
    if (this.authService && this.isInitialized) {
      try {
        await this.authService.close();
        this.logger.log('AuthService destroyed successfully');
      } catch (error) {
        this.logger.error('Error during AuthService destruction:', error.message);
      }
    }
  }

  // ============================================================================
  // MÉTHODES AVEC GESTION D'ERREURS AMÉLIORÉE
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
    this.ensureInitialized();
    
    try {
      this.logger.debug(`🔐 Attempting login for user: ${username}`);
      
      const result = await this.authService.login(username, password);
      
      this.logger.log(`✅ Login successful for user: ${username}`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Login failed for user ${username}:`, error.message);
      
      // Log détaillé de l'erreur pour debugging
      if (error.response) {
        this.logger.error('Keycloak response:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    this.ensureInitialized();
    
    try {
      const result = await this.authService.validateToken(token);
      this.logger.debug(`✅ Token validation successful for user: ${result.userId}`);
      return result;
      
    } catch (error) {
      this.logger.error('❌ Token validation failed:', error.message);
      return { valid: false };
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    this.ensureInitialized();
    
    try {
      const result = await this.authService.refreshToken(refreshToken);
      this.logger.debug('✅ Token refresh successful');
      return result;
      
    } catch (error) {
      this.logger.error('❌ Token refresh failed:', error.message);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  async getClientCredentialsToken(): Promise<AuthResponse> {
    this.ensureInitialized();
    
    try {
      const result = await this.authService.getClientCredentialsToken();
      this.logger.debug('✅ Client credentials token obtained');
      return result;
      
    } catch (error) {
      this.logger.error('❌ Client credentials token failed:', error.message);
      throw new Error(`Client credentials failed: ${error.message}`);
    }
  }

  async logout(token: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.authService.logout(token);
      this.logger.debug('✅ Logout successful');
      
    } catch (error) {
      this.logger.error('❌ Logout failed:', error.message);
      // Ne pas throw pour logout, log seulement
    }
  }

  async invalidateUserCache(userId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.authService.invalidateUserCache(userId);
      this.logger.debug(`✅ Cache invalidated for user: ${userId}`);
      
    } catch (error) {
      this.logger.error(`❌ Cache invalidation failed for user ${userId}:`, error.message);
    }
  }

  // ============================================================================
  // MÉTHODES DE TEST
  // ============================================================================

  async testKeycloakConnection(): Promise<ConnectionTestResult> {
    if (!this.isInitialized) {
      return { connected: false, error: 'Service not initialized' };
    }
    
    try {
      const result = await this.authService.testKeycloakConnection();
      this.logger.debug(`Keycloak test: ${result.connected ? '✅' : '❌'}`);
      return result;
    } catch (error) {
      this.logger.error('Keycloak connection test failed:', error.message);
      return { connected: false, error: error.message };
    }
  }

  async testRedisConnection(): Promise<ConnectionTestResult> {
    if (!this.isInitialized) {
      return { connected: false, error: 'Service not initialized' };
    }
    
    try {
      const result = await this.authService.testRedisConnection();
      this.logger.debug(`Redis test: ${result.connected ? '✅' : '❌'}`);
      return result;
    } catch (error) {
      this.logger.error('Redis connection test failed:', error.message);
      return { connected: false, error: error.message };
    }
  }

  async testOPAConnection(): Promise<ConnectionTestResult> {
    if (!this.isInitialized) {
      return { connected: false, error: 'Service not initialized' };
    }
    
    try {
      const result = await this.authService.testOPAConnection();
      this.logger.debug(`OPA test: ${result.connected ? '✅' : '❌'}`);
      return result;
    } catch (error) {
      this.logger.error('OPA connection test failed:', error.message);
      return { connected: false, error: error.message };
    }
  }

  // ============================================================================
  // MÉTHODES AVEC FALLBACK POSTGRESQL
  // ============================================================================

  async getUserInfo(userId: string): Promise<ExtendedUserInfo | null> {
    this.ensureInitialized();
    
    try {
      // Récupérer d'abord depuis PostgreSQL si disponible
      try {
        const postgresUser = await this.postgresUserService.getUserById(userId);
        if (postgresUser) {
          this.logger.debug(`✅ User info retrieved from PostgreSQL: ${userId}`);
          return this.mapPostgresUserToUserInfo(postgresUser);
        }
      } catch (pgError) {
        this.logger.warn(`PostgreSQL unavailable for user ${userId}, trying Keycloak:`, pgError.message);
      }

      // Fallback vers smp-auth-ts
      const userInfo = await this.authService.getUserInfo(userId);
      if (!userInfo) {
        this.logger.warn(`User not found: ${userId}`);
        return null;
      }

      this.logger.debug(`✅ User info retrieved from Keycloak: ${userId}`);

      // Synchroniser vers PostgreSQL en arrière-plan (sans bloquer)
      this.syncUserToPostgres(userInfo).catch(error => {
        this.logger.warn(`Background sync failed for user ${userId}:`, error.message);
      });

      return TypeMappers.toExtendedUserInfo(userInfo);
      
    } catch (error) {
      this.logger.error(`❌ Failed to get user info for ${userId}:`, error.message);
      return null;
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      // Essayer PostgreSQL d'abord
      try {
        const postgresUser = await this.postgresUserService.getUserById(userId);
        if (postgresUser && postgresUser.roles) {
          return Array.isArray(postgresUser.roles) ? postgresUser.roles : [];
        }
      } catch (pgError) {
        this.logger.debug(`PostgreSQL unavailable for roles ${userId}, trying Keycloak`);
      }

      // Fallback vers smp-auth-ts
      const roles = await this.authService.getUserRoles(userId);
      this.logger.debug(`✅ User roles retrieved: ${userId} -> ${roles.join(', ')}`);
      return roles;
      
    } catch (error) {
      this.logger.error(`❌ Failed to get user roles for ${userId}:`, error.message);
      return [];
    }
  }

  async validateTokenEnriched(token: string): Promise<ExtendedEnrichedTokenValidationResult> {
    this.ensureInitialized();
    
    try {
      const basicValidation = await this.validateToken(token);
      
      if (!basicValidation.valid || !basicValidation.userId) {
        return { valid: false };
      }

      const userInfo = await this.getUserInfo(basicValidation.userId);
      
      return {
        valid: true,
        userInfo: userInfo || undefined,
        userId: basicValidation.userId,
        email: basicValidation.email,
        givenName: basicValidation.givenName,
        familyName: basicValidation.familyName,
        roles: basicValidation.roles
      };
      
    } catch (error) {
      this.logger.error('❌ Enriched token validation failed:', error.message);
      return { valid: false };
    }
  }

  // ============================================================================
  // AUTORISATION AVEC FALLBACK
  // ============================================================================

  async checkPermission(
    token: string, 
    resourceId: string, 
    resourceType: string, 
    action: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const result = await this.authService.checkPermission(token, resourceId, resourceType, action, context);
      this.logger.debug(`✅ Permission check: ${action} on ${resourceType}:${resourceId} -> ${result}`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Permission check failed: ${action} on ${resourceType}:${resourceId}:`, error.message);
      return false; // Deny by default en cas d'erreur
    }
  }

  async checkPermissionDetailed(
    token: string,
    resourceId: string,
    resourceType: string,
    action: string,
    context?: Record<string, any>
  ) {
    this.ensureInitialized();
    
    try {
      const result = await this.authService.checkPermissionDetailed(token, resourceId, resourceType, action, context);
      this.logger.debug(`✅ Detailed permission check: ${action} on ${resourceType}:${resourceId} -> ${result.allowed}`);
      return result;
      
    } catch (error) {
      this.logger.error(`❌ Detailed permission check failed:`, error.message);
      return {
        allowed: false,
        reason: 'Permission check failed due to system error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // ============================================================================
  // MÉTRIQUES ET ÉVÉNEMENTS
  // ============================================================================

  getMetrics(): Record<string, any> {
    if (!this.isInitialized) {
      return { error: 'Service not initialized' };
    }
    
    try {
      const metrics = this.authService.getMetrics();
      return {
        ...metrics,
        initialized: this.isInitialized,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('❌ Failed to get metrics:', error.message);
      return { error: error.message };
    }
  }

  resetMetrics(): void {
    if (this.isInitialized) {
      try {
        this.authService.resetMetrics();
        this.logger.debug('✅ Metrics reset');
      } catch (error) {
        this.logger.error('❌ Failed to reset metrics:', error.message);
      }
    }
  }

  addEventListener(eventType: AuthEventType, callback: EventCallback): void {
    if (this.isInitialized) {
      this.authService.addEventListener(eventType, callback);
    }
  }

  removeEventListener(eventType: AuthEventType, callback: EventCallback): void {
    if (this.isInitialized) {
      this.authService.removeEventListener(eventType, callback);
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES ET UTILITAIRES
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('AuthService not initialized. Please check configuration and external services.');
    }
  }

  private async testExternalServices(config: AuthConfig): Promise<void> {
    const results = await Promise.allSettled([
      this.testServiceEndpoint(config.keycloak.url + '/realms/' + config.keycloak.realm, 'Keycloak'),
      this.testServiceEndpoint(config.opa.url + '/health', 'OPA'),
      this.testRedisConnectivity(config.redis)
    ]);

    const failures = results
      .map((result, index) => ({ result, service: ['Keycloak', 'OPA', 'Redis'][index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ service }) => service);

    if (failures.length > 0) {
      this.logger.warn(`⚠️ Some external services are unavailable: ${failures.join(', ')}`);
      this.logger.warn('Service will continue with limited functionality');
    }
  }

  private async testServiceEndpoint(url: string, serviceName: string): Promise<void> {
    try {
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        this.logger.debug(`✅ ${serviceName} is accessible`);
      } else {
        this.logger.warn(`⚠️ ${serviceName} returned status ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`⚠️ ${serviceName} is not accessible:`, error.message);
      throw error;
    }
  }

  private async testRedisConnectivity(redisConfig: AuthConfig['redis']): Promise<void> {
    // Test simple de connectivité Redis
    try {
      const { createClient } = await import('redis');
      const testClient = createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: 2000
        },
        password: redisConfig.password
      });
      
      await testClient.connect();
      await testClient.ping();
      await testClient.quit();
      
      this.logger.debug('✅ Redis is accessible');
    } catch (error) {
      this.logger.warn('⚠️ Redis is not accessible:', error.message);
      throw error;
    }
  }

  private createMockAuthService(): IAuthenticationService {
    this.logger.warn('🔧 Creating mock AuthService for development');
    
    const { createMockAuthService } = require('smp-auth-ts');
    
    return createMockAuthService({
      tokenValidation: true,
      authorizationDecision: true,
      userInfo: {
        sub: 'mock-user-123',
        email: 'mock@example.com',
        given_name: 'Mock',
        family_name: 'User',
        roles: ['USER', 'MOCK']
      }
    });
  }

  private setupEventHandlers(): void {
    try {
      this.authService.addEventListener('login', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'login',
          userId: event.userId,
          username: event.username,
          success: event.success,
          duration: event.duration,
          error: event.error,
          details: event.details
        });
      });

      this.authService.addEventListener('logout', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'logout',
          userId: event.userId,
          success: event.success,
          duration: event.duration,
          details: event.details
        });
      });

      this.authService.addEventListener('token_validation', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'token_validation',
          userId: event.userId,
          success: event.success,
          duration: event.duration,
          error: event.error,
          details: event.details
        });
      });

      this.authService.addEventListener('token_refresh', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'token_refresh',
          userId: event.userId,
          success: event.success,
          duration: event.duration,
          error: event.error,
          details: event.details
        });
      });
      
      this.logger.debug('✅ Event handlers configured');
    } catch (error) {
      this.logger.warn('⚠️ Failed to setup event handlers:', error.message);
    }
  }

  private mapPostgresUserToUserInfo(pgUser: any): ExtendedUserInfo {
    const baseUserInfo: UserInfo = {
      sub: pgUser.id,
      email: pgUser.email,
      given_name: pgUser.first_name,
      family_name: pgUser.last_name,
      preferred_username: pgUser.username,
      roles: Array.isArray(pgUser.roles) ? pgUser.roles : [],
      organization_ids: Array.isArray(pgUser.organization_ids) ? pgUser.organization_ids : [],
      state: pgUser.state,
      attributes: {
        department: pgUser.department,
        clearanceLevel: pgUser.clearance_level,
        contractExpiryDate: pgUser.contract_expiry_date?.toISOString(),
        managerId: pgUser.manager_id,
        jobTitle: pgUser.job_title,
        businessUnit: pgUser.business_unit,
        workLocation: pgUser.work_location,
        employmentType: pgUser.employment_type,
        verificationStatus: pgUser.verification_status,
        riskScore: pgUser.risk_score,
        firstName: pgUser.first_name,
        lastName: pgUser.last_name,
        phoneNumber: pgUser.phone_number,
        nationality: pgUser.nationality,
        dateOfBirth: pgUser.date_of_birth?.toISOString(),
        gender: pgUser.gender,
        ...pgUser.custom_attributes
      },
      resource_access: {},
      realm_access: { roles: Array.isArray(pgUser.roles) ? pgUser.roles : [] }
    };

    return TypeMappers.toExtendedUserInfo(baseUserInfo, pgUser);
  }

  private async syncUserToPostgres(userInfo: UserInfo): Promise<void> {
    try {
      const userData = TypeMappers.toPostgresUserData(userInfo as ExtendedUserInfo);
      await this.postgresUserService.createUser(userData);
      
      await this.eventLogger.logEvent({
        type: LOCAL_EVENT_TYPES.SYNC,
        userId: userInfo.sub,
        success: true,
        details: {
          operation: 'user_sync_keycloak_to_postgres',
          username: userInfo.preferred_username
        }
      });
      
      this.logger.debug(`✅ User synced to PostgreSQL: ${userInfo.preferred_username}`);
    } catch (error) {
      this.logger.warn(`⚠️ Failed to sync user to PostgreSQL:`, error.message);
      
      await this.eventLogger.logEvent({
        type: 'error',
        userId: userInfo.sub,
        success: false,
        error: error.message,
        details: {
          operation: 'user_sync_keycloak_to_postgres',
          username: userInfo.preferred_username
        }
      });
    }
  }

  // ============================================================================
  // MÉTHODES DE COMPATIBILITÉ
  // ============================================================================

  async authenticateUser(username: string, password: string): Promise<{accessToken: string, refreshToken: string}> {
    const result = await this.login(username, password);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token || ''
    };
  }

  async refreshUserToken(refreshToken: string): Promise<{accessToken: string, refreshToken: string}> {
    const result = await this.refreshToken(refreshToken);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token || ''
    };
  }

  async logoutUser(token: string): Promise<void> {
    return this.logout(token);
  }

  async getAdminToken(): Promise<string> {
    const tokenResponse = await this.getClientCredentialsToken();
    return tokenResponse.access_token;
  }
}