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
  EventCallback,
  UserRegistrationData,
  UserRegistrationResult
} from 'smp-auth-ts';

import { PostgresUserService } from './services/postgres-user.service';
import { EventLoggerService } from './services/event-logger.service';
import { 
  ExtendedUserInfo, 
  ExtendedEnrichedTokenValidationResult,
  TypeMappers,
  LOCAL_EVENT_TYPES
} from '../common/types/auth-extended.types';

import {
  UserRegistrationInputDto,
  UserRegistrationResponseDto,
  EmailVerificationResponseDto,
  PasswordResetResponseDto,
  PasswordChangeResponseDto,
  VerifyEmailInputDto,
  ResetPasswordInputDto,
  ChangePasswordInputDto,
  ResendVerificationInputDto,
  UserManagementEvent,
  UserManagementEventType
} from './dto/user-registration.dto';

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
    private readonly eventLogger: EventLoggerService,
    private readonly validationService: UserRegistrationValidationService
  ) {}

  async onModuleInit() {
    try {
      this.logger.log('🔄 Initializing AuthService with user management...');
      
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

      this.authService = createAuthService(authConfig, authOptions);
      this.setupEventHandlers();
      this.isInitialized = true;
      
      this.logger.log('✅ AuthService with user management initialized successfully');
      
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
  // GESTION DES UTILISATEURS - NOUVELLES FONCTIONS
  // ============================================================================

  /**
   * Enregistrement d'un nouvel utilisateur avec validation complète
   */
  async registerUser(input: UserRegistrationInputDto): Promise<UserRegistrationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔐 Starting user registration for: ${input.username}`);
      
      // 1. Validation complète des données
      const validationResult = await this.validationService.validateRegistrationData(input);
      if (!validationResult.valid) {
        await this.emitUserManagementEvent({
          type: 'user_registered',
          username: input.username,
          email: input.email,
          success: false,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          error: 'Validation failed',
          details: {
            correlationId,
            errors: validationResult.errors
          }
        });

        return {
          success: false,
          message: 'Validation failed',
          errors: validationResult.errors
        };
      }

      // 2. Préparer les données pour smp-auth-ts
      const registrationData: UserRegistrationData = {
        username: input.username,
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: input.enabled !== false,
        emailVerified: input.emailVerified || false,
        attributes: input.attributes || {}
      };

      // 3. Déléguer l'enregistrement vers smp-auth-ts
      const result = await this.authService.registerUser(registrationData);
      
      if (result.success && result.userId) {
        this.logger.log(`✅ User registered successfully: ${input.username} (ID: ${result.userId})`);
        
        // 4. Synchroniser vers PostgreSQL en arrière-plan
        this.syncNewUserToPostgres(result.userId, input).catch(error => {
          this.logger.warn(`Background PostgreSQL sync failed for user ${input.username}:`, error.message);
        });

        // 5. Émettre événement de succès
        await this.emitUserManagementEvent({
          type: 'user_registered',
          userId: result.userId,
          username: input.username,
          email: input.email,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: {
            correlationId,
            registrationMethod: 'standard',
            emailVerificationRequired: !input.emailVerified,
            verificationEmailSent: !input.emailVerified
          }
        });

        return {
          success: true,
          userId: result.userId,
          message: input.emailVerified ? 
            'User registered successfully' : 
            'User registered successfully. Please check your email for verification.',
          verificationEmailSent: !input.emailVerified
        };
      }
      
      return {
        success: false,
        message: result.message,
        errors: result.errors
      };
      
    } catch (error) {
      this.logger.error(`❌ User registration failed for ${input.username}:`, error.message);
      
      await this.emitUserManagementEvent({
        type: 'user_registered',
        username: input.username,
        email: input.email,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
        details: { correlationId }
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
  async verifyEmail(input: VerifyEmailInputDto): Promise<EmailVerificationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`📧 Verifying email for user: ${input.userId}`);
      
      const success = await this.authService.verifyEmail(input.userId, input.token);
      
      if (success) {
        // Mettre à jour PostgreSQL
        await this.postgresUserService.updateUser(input.userId, {
          email_verified: true,
          verification_status: 'VERIFIED'
        }).catch(error => {
          this.logger.warn(`Failed to update PostgreSQL for user ${input.userId}:`, error.message);
        });

        await this.emitUserManagementEvent({
          type: 'email_verified',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId }
        });

        return {
          success: true,
          message: 'Email verified successfully'
        };
      } else {
        await this.emitUserManagementEvent({
          type: 'email_verified',
          userId: input.userId,
          success: false,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          error: 'Invalid verification token',
          details: { correlationId }
        });

        return {
          success: false,
          message: 'Invalid verification token or expired',
          errorCode: 'INVALID_TOKEN'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Email verification failed for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Email verification failed',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Renvoi d'email de vérification
   */
  async resendVerificationEmail(input: ResendVerificationInputDto): Promise<EmailVerificationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`📧 Resending verification email for user: ${input.userId}`);
      
      const success = await this.authService.resendVerificationEmail(input.userId);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'email_verification_sent',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId, verificationEmailSent: true }
        });

        return {
          success: true,
          message: 'Verification email sent successfully'
        };
      } else {
        return {
          success: false,
          message: 'Failed to send verification email',
          errorCode: 'SEND_FAILED'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Failed to resend verification email for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Failed to send verification email',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Demande de reset de mot de passe
   */
  async resetPassword(input: ResetPasswordInputDto): Promise<PasswordResetResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔑 Initiating password reset for: ${input.email}`);
      
      const success = await this.authService.resetPassword(input.email);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'password_reset_requested',
          email: input.email,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId }
        });

        return {
          success: true,
          message: 'Password reset email sent successfully',
          requestId: correlationId
        };
      } else {
        return {
          success: false,
          message: 'Email not found or reset failed'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Password reset failed for ${input.email}:`, error.message);
      
      return {
        success: false,
        message: 'Password reset request failed'
      };
    }
  }

  /**
   * Changement de mot de passe
   */
  async changePassword(input: ChangePasswordInputDto): Promise<PasswordChangeResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔑 Changing password for user: ${input.userId}`);
      
      // Validation du nouveau mot de passe
      const passwordValidation = await this.validationService.validatePassword(input.newPassword);
      if (!passwordValidation.valid) {
        return {
          success: false,
          message: `Password validation failed: ${passwordValidation.errors.join(', ')}`
        };
      }

      const success = await this.authService.changePassword(input.userId, input.oldPassword, input.newPassword);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'password_changed',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { 
            correlationId,
            passwordComplexityMet: passwordValidation.score >= 70
          }
        });

        return {
          success: true,
          message: 'Password changed successfully',
          requiresReauth: true
        };
      } else {
        return {
          success: false,
          message: 'Password change failed. Please check your current password.'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Password change failed for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Password change failed due to system error'
      };
    }
  }


  // ============================================================================
  // MÉTHODES AVEC GESTION D'ERREURS AMÉLIORÉE
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
  this.ensureInitialized();
  
  try {
    this.logger.debug(`🔐 Attempting login for user: ${username}`);
    console.log('🔍 AUTH_SERVICE: Starting login process');
    
    // Authentification via Keycloak (UNE SEULE FOIS!)
    const result = await this.authService.login(username, password);
    console.log('🔍 AUTH_SERVICE: Keycloak login successful, got token');
    
    this.logger.log(`✅ Login successful for user: ${username}`);
    console.log('🔍 AUTH_SERVICE: Login process completed successfully');
    
    return result; // Retourner le résultat du login, pas faire un deuxième login!
    
  } catch (error) {
    console.log('🔍 AUTH_SERVICE: Error in login process:', error);
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
    console.log('🔍 Debug: Testing Keycloak connection...');
    
    // Test direct avec l'instance du service
    const result = await this.authService.testKeycloakConnection();
    console.log('🔍 Debug: smp-auth-ts result:', result);
    
    // Test manuel supplémentaire
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    console.log(`🔍 Debug: Testing manual endpoints for ${keycloakUrl}`);
    
    // Test des différents endpoints possibles
    const endpointsToTest = [
      `${keycloakUrl}/health/ready`,
      `${keycloakUrl}/health`,
      `${keycloakUrl}/realms/${realm}`,
      `${keycloakUrl}/realms/${realm}/.well-known/openid_configuration`,
      `${keycloakUrl}/`
    ];
    
    for (const endpoint of endpointsToTest) {
      try {
        console.log(`🔍 Debug: Testing ${endpoint}`);
        const response = await fetch(endpoint, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        console.log(`🔍 Debug: ${endpoint} -> ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log(`🔍 Debug: Content-Type: ${contentType}`);
          
          if (contentType?.includes('application/json')) {
            const data = await response.json();
            console.log(`🔍 Debug: Response keys: ${Object.keys(data).slice(0, 5).join(', ')}`);
          }
        }
      } catch (error) {
        console.log(`🔍 Debug: ${endpoint} -> ERROR: ${error.message}`);
      }
    }
    
    console.log('🔍 Debug: Keycloak test completed');
    return result;
    
  } catch (error) {
    console.error('🔍 Debug: Keycloak connection test failed:', error);
    return {
      connected: false,
      error: `Keycloak connection failed: ${error.message}`
    };
  }
}

// Ajoutez aussi cette méthode pour comparer les résultats
async debugAllConnections(): Promise<void> {
  console.log('🔍 Debug: Testing all connections...');
  
  const [keycloak, redis, opa] = await Promise.allSettled([
    this.testKeycloakConnection(),
    this.testRedisConnection(), 
    this.testOPAConnection()
  ]);
  
  console.log('🔍 Debug results:');
  console.log('Keycloak:', keycloak);
  console.log('Redis:', redis);
  console.log('OPA:', opa);
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
  }// mu-auth/src/auth/auth.service.ts - Version avec debugging amélioré
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
  EventCallback,
  UserRegistrationData,
  UserRegistrationResult
} from 'smp-auth-ts';

import { PostgresUserService } from './services/postgres-user.service';
import { EventLoggerService } from './services/event-logger.service';
import { 
  ExtendedUserInfo, 
  ExtendedEnrichedTokenValidationResult,
  TypeMappers,
  LOCAL_EVENT_TYPES
} from '../common/types/auth-extended.types';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';

import {
  UserRegistrationInputDto,
  UserRegistrationResponseDto,
  EmailVerificationResponseDto,
  PasswordResetResponseDto,
  PasswordChangeResponseDto,
  VerifyEmailInputDto,
  ResetPasswordInputDto,
  ChangePasswordInputDto,
  ResendVerificationInputDto,
  UserManagementEvent,
  UserManagementEventType
} from './dto/user-registration.dto';

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
  private readonly eventLogger: EventLoggerService,
  private readonly validationService: UserRegistrationValidationService // Ajouter cette ligne
) {}

  async onModuleInit() {
    try {
      this.logger.log('🔄 Initializing AuthService with user management...');
      
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

      this.authService = createAuthService(authConfig, authOptions);
      this.setupEventHandlers();
      this.isInitialized = true;
      
      this.logger.log('✅ AuthService with user management initialized successfully');
      
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
  // GESTION DES UTILISATEURS - NOUVELLES FONCTIONS
  // ============================================================================

  /**
   * Enregistrement d'un nouvel utilisateur avec validation complète
   */
  async registerUser(input: UserRegistrationInputDto): Promise<UserRegistrationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔐 Starting user registration for: ${input.username}`);
      
      // 1. Validation complète des données
      const validationResult = await this.validationService.validateRegistrationData(input);
      if (!validationResult.valid) {
        await this.emitUserManagementEvent({
          type: 'user_registered',
          username: input.username,
          email: input.email,
          success: false,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          error: 'Validation failed',
          details: {
            correlationId,
            errors: validationResult.errors
          }
        });

        return {
          success: false,
          message: 'Validation failed',
          errors: validationResult.errors
        };
      }

      // 2. Préparer les données pour smp-auth-ts
      const registrationData: UserRegistrationData = {
        username: input.username,
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: input.enabled !== false,
        emailVerified: input.emailVerified || false,
        attributes: input.attributes || {}
      };

      // 3. Déléguer l'enregistrement vers smp-auth-ts
      const result = await this.authService.registerUser(registrationData);
      
      if (result.success && result.userId) {
        this.logger.log(`✅ User registered successfully: ${input.username} (ID: ${result.userId})`);
        
        // 4. Synchroniser vers PostgreSQL en arrière-plan
        this.syncNewUserToPostgres(result.userId, input).catch(error => {
          this.logger.warn(`Background PostgreSQL sync failed for user ${input.username}:`, error.message);
        });

        // 5. Émettre événement de succès
        await this.emitUserManagementEvent({
          type: 'user_registered',
          userId: result.userId,
          username: input.username,
          email: input.email,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: {
            correlationId,
            registrationMethod: 'standard',
            emailVerificationRequired: !input.emailVerified,
            verificationEmailSent: !input.emailVerified
          }
        });

        return {
          success: true,
          userId: result.userId,
          message: input.emailVerified ? 
            'User registered successfully' : 
            'User registered successfully. Please check your email for verification.',
          verificationEmailSent: !input.emailVerified
        };
      }
      
      return {
        success: false,
        message: result.message,
        errors: result.errors
      };
      
    } catch (error) {
      this.logger.error(`❌ User registration failed for ${input.username}:`, error.message);
      
      await this.emitUserManagementEvent({
        type: 'user_registered',
        username: input.username,
        email: input.email,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
        details: { correlationId }
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
  async verifyEmail(input: VerifyEmailInputDto): Promise<EmailVerificationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`📧 Verifying email for user: ${input.userId}`);
      
      const success = await this.authService.verifyEmail(input.userId, input.token);
      
      if (success) {
        // Mettre à jour PostgreSQL
        await this.postgresUserService.updateUser(input.userId, {
          email_verified: true,
          verification_status: 'VERIFIED'
        }).catch(error => {
          this.logger.warn(`Failed to update PostgreSQL for user ${input.userId}:`, error.message);
        });

        await this.emitUserManagementEvent({
          type: 'email_verified',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId }
        });

        return {
          success: true,
          message: 'Email verified successfully'
        };
      } else {
        await this.emitUserManagementEvent({
          type: 'email_verified',
          userId: input.userId,
          success: false,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          error: 'Invalid verification token',
          details: { correlationId }
        });

        return {
          success: false,
          message: 'Invalid verification token or expired',
          errorCode: 'INVALID_TOKEN'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Email verification failed for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Email verification failed',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Renvoi d'email de vérification
   */
  async resendVerificationEmail(input: ResendVerificationInputDto): Promise<EmailVerificationResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`📧 Resending verification email for user: ${input.userId}`);
      
      const success = await this.authService.resendVerificationEmail(input.userId);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'email_verification_sent',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId, verificationEmailSent: true }
        });

        return {
          success: true,
          message: 'Verification email sent successfully'
        };
      } else {
        return {
          success: false,
          message: 'Failed to send verification email',
          errorCode: 'SEND_FAILED'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Failed to resend verification email for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Failed to send verification email',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Demande de reset de mot de passe
   */
  async resetPassword(input: ResetPasswordInputDto): Promise<PasswordResetResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔑 Initiating password reset for: ${input.email}`);
      
      const success = await this.authService.resetPassword(input.email);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'password_reset_requested',
          email: input.email,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { correlationId }
        });

        return {
          success: true,
          message: 'Password reset email sent successfully',
          requestId: correlationId
        };
      } else {
        return {
          success: false,
          message: 'Email not found or reset failed'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Password reset failed for ${input.email}:`, error.message);
      
      return {
        success: false,
        message: 'Password reset request failed'
      };
    }
  }

  /**
   * Changement de mot de passe
   */
  async changePassword(input: ChangePasswordInputDto): Promise<PasswordChangeResponseDto> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    
    try {
      this.logger.log(`🔑 Changing password for user: ${input.userId}`);
      
      // Validation du nouveau mot de passe
      const passwordValidation = await this.validationService.validatePassword(input.newPassword);
      if (!passwordValidation.valid) {
        return {
          success: false,
          message: `Password validation failed: ${passwordValidation.errors.join(', ')}`
        };
      }

      const success = await this.authService.changePassword(input.userId, input.oldPassword, input.newPassword);
      
      if (success) {
        await this.emitUserManagementEvent({
          type: 'password_changed',
          userId: input.userId,
          success: true,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: { 
            correlationId,
            passwordComplexityMet: passwordValidation.score >= 70
          }
        });

        return {
          success: true,
          message: 'Password changed successfully',
          requiresReauth: true
        };
      } else {
        return {
          success: false,
          message: 'Password change failed. Please check your current password.'
        };
      }
      
    } catch (error) {
      this.logger.error(`❌ Password change failed for user ${input.userId}:`, error.message);
      
      return {
        success: false,
        message: 'Password change failed due to system error'
      };
    }
  }

  private async syncNewUserToPostgres(userId: string, input: UserRegistrationInputDto): Promise<void> {
    try {
      const userData = {
        id: userId,
        username: input.username,
        email: input.email,
        email_verified: input.emailVerified || false,
        first_name: input.firstName,
        last_name: input.lastName,
        enabled: input.enabled !== false,
        state: 'ACTIVE',
        created_timestamp: new Date(),
        updated_timestamp: new Date(),
        // Autres champs par défaut
        clearance_level: 1,
        hierarchy_level: 1,
        employment_type: 'PERMANENT',
        verification_status: 'PENDING',
        risk_score: 0,
        failed_login_attempts: 0
      };

      await this.postgresUserService.createUser(userData);
      console.log(`✅ User synced to PostgreSQL: ${input.username}`);
      
    } catch (error) {
      console.warn(`⚠️ Failed to sync user to PostgreSQL:`, error);
    }
  }

  private async emitUserManagementEvent(event: any): Promise<void> {
    try {
      await this.eventLogger.logEvent({
        type: event.type,
        userId: event.userId,
        username: event.username,
        success: event.success,
        // SUPPRIMER timestamp car il sera généré automatiquement dans logEvent
        // timestamp: event.timestamp, // <-- SUPPRIMER cette ligne
        duration: event.duration,
        error: event.error,
        details: event.details
      });
    } catch (error) {
      console.error('Failed to emit user management event:', error);
    }
  }

private generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}


  // ============================================================================
  // MÉTHODES AVEC GESTION D'ERREURS AMÉLIORÉE
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
  this.ensureInitialized();
  
  try {
    this.logger.debug(`🔐 Attempting login for user: ${username}`);
    console.log('🔍 AUTH_SERVICE: Starting login process');
    
    // Authentification via Keycloak (UNE SEULE FOIS!)
    const result = await this.authService.login(username, password);
    console.log('🔍 AUTH_SERVICE: Keycloak login successful, got token');
    
    this.logger.log(`✅ Login successful for user: ${username}`);
    console.log('🔍 AUTH_SERVICE: Login process completed successfully');
    
    return result; // Retourner le résultat du login, pas faire un deuxième login!
    
  } catch (error) {
    console.log('🔍 AUTH_SERVICE: Error in login process:', error);
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
    console.log('🔍 Debug: Testing Keycloak connection...');
    
    // Test direct avec l'instance du service
    const result = await this.authService.testKeycloakConnection();
    console.log('🔍 Debug: smp-auth-ts result:', result);
    
    // Test manuel supplémentaire
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    console.log(`🔍 Debug: Testing manual endpoints for ${keycloakUrl}`);
    
    // Test des différents endpoints possibles
    const endpointsToTest = [
      `${keycloakUrl}/health/ready`,
      `${keycloakUrl}/health`,
      `${keycloakUrl}/realms/${realm}`,
      `${keycloakUrl}/realms/${realm}/.well-known/openid_configuration`,
      `${keycloakUrl}/`
    ];
    
    for (const endpoint of endpointsToTest) {
      try {
        console.log(`🔍 Debug: Testing ${endpoint}`);
        const response = await fetch(endpoint, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        console.log(`🔍 Debug: ${endpoint} -> ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          console.log(`🔍 Debug: Content-Type: ${contentType}`);
          
          if (contentType?.includes('application/json')) {
            const data = await response.json();
            console.log(`🔍 Debug: Response keys: ${Object.keys(data).slice(0, 5).join(', ')}`);
          }
        }
      } catch (error) {
        console.log(`🔍 Debug: ${endpoint} -> ERROR: ${error.message}`);
      }
    }
    
    console.log('🔍 Debug: Keycloak test completed');
    return result;
    
  } catch (error) {
    console.error('🔍 Debug: Keycloak connection test failed:', error);
    return {
      connected: false,
      error: `Keycloak connection failed: ${error.message}`
    };
  }
}

// Ajoutez aussi cette méthode pour comparer les résultats
async debugAllConnections(): Promise<void> {
  console.log('🔍 Debug: Testing all connections...');
  
  const [keycloak, redis, opa] = await Promise.allSettled([
    this.testKeycloakConnection(),
    this.testRedisConnection(), 
    this.testOPAConnection()
  ]);
  
  console.log('🔍 Debug results:');
  console.log('Keycloak:', keycloak);
  console.log('Redis:', redis);
  console.log('OPA:', opa);
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

  async getUserInfo(userId: string): Promise<UserInfo | null> {
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

  async getAdminToken(): Promise<string> {
    const tokenResponse = await this.getClientCredentialsToken();
    return tokenResponse.access_token;
  }

  
}