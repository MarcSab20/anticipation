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
  ValidationResult,
  UserInfo,
  AuthEvent,
  AuthEventType,
  EventCallback,
  UserRegistrationData,
  UserRegistrationResult
} from 'smp-auth-ts';

import { 
  createExtendedAuthService,
  ExtendedAuthService,
  ExtendedAuthOptions,
  LoginWithMFAResult,
  AuthenticationFlow
} from 'smp-auth-ts';
import {
  MFASetupRequest,
  MFASetupResult,
  MFAVerificationRequest,
  MFAMethodType,
  MFAVerificationResult,
  MagicLinkRequest,
  MagicLinkResult,
  MagicLinkVerificationResult,
  PasswordlessAuthRequest,
  PasswordlessAuthResult,
  TrustedDevice,
  DeviceTrustRequest,
  DeviceTrustResult,
  MFAMethod,
  BackupCodesGeneration,
  RecoveryOptions
} from 'smp-auth-ts';

import { PostgresUserService, UserCreationData } from './services/postgres-user.service';
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

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private extendedAuthService: ExtendedAuthService;
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

      const authOptions: ExtendedAuthOptions = {
        enableCache: this.configService.get<boolean>('ENABLE_AUTH_CACHE', true),
        cacheExpiry: parseInt(this.configService.get<string>('AUTH_CACHE_EXPIRY', '3600')),
        enableLogging: this.configService.get<boolean>('ENABLE_AUTH_LOGGING', true),
        enableSessionTracking: this.configService.get<boolean>('ENABLE_SESSION_TRACKING', true),
        maxSessions: parseInt(this.configService.get<string>('MAX_USER_SESSIONS', '5')),
        tokenValidationStrategy: this.configService.get<'introspection' | 'jwt_decode' | 'userinfo'>('TOKEN_VALIDATION_STRATEGY', 'introspection'),
        enableMFA: this.configService.get<boolean>('MFA_ENABLED', true),
        enableMagicLink: this.configService.get<boolean>('MAGIC_LINK_ENABLED', true),
        enableDeviceTrust: this.configService.get<boolean>('DEVICE_TRUST_ENABLED', true),
        development: {
          enableDebugLogging: this.configService.get<string>('NODE_ENV') === 'development',
          mockMode: this.configService.get<boolean>('AUTH_MOCK_MODE', false),
          bypassAuthentication: this.configService.get<boolean>('AUTH_BYPASS', false)
        }
      };

      // Créer la configuration étendue avec les options MFA et Magic Link
      const extendedConfig = {
        ...authConfig,
        mfa: {
          enabled: this.configService.get<boolean>('MFA_ENABLED', true),
          enforcedForRoles: this.configService.get<string>('MFA_ENFORCED_ROLES', 'admin,super_admin').split(','),
          gracePeriodDays: parseInt(this.configService.get<string>('MFA_GRACE_PERIOD_DAYS', '7')),
          maxAttempts: parseInt(this.configService.get<string>('MFA_MAX_ATTEMPTS', '3')),
          codeLength: parseInt(this.configService.get<string>('MFA_CODE_LENGTH', '6')),
          codeExpiry: parseInt(this.configService.get<string>('MFA_CODE_EXPIRY', '300')),
          allowedMethods: this.configService.get<string>('MFA_ALLOWED_METHODS', 'totp,sms,email,backup_codes')
            .split(',')
            .map(method => method.trim()) as any[],
          requireBackupCodes: this.configService.get<boolean>('MFA_REQUIRE_BACKUP_CODES', true),
          rememberDeviceDays: parseInt(this.configService.get<string>('MFA_REMEMBER_DEVICE_DAYS', '30'))
        },
        magicLink: {
          enabled: this.configService.get<boolean>('MAGIC_LINK_ENABLED', true),
          tokenLength: parseInt(this.configService.get<string>('MAGIC_LINK_TOKEN_LENGTH', '32')),
          expiryMinutes: parseInt(this.configService.get<string>('MAGIC_LINK_EXPIRY_MINUTES', '30')),
          maxUsesPerDay: parseInt(this.configService.get<string>('MAGIC_LINK_MAX_USES_PER_DAY', '10')),
          requireExistingUser: this.configService.get<boolean>('MAGIC_LINK_REQUIRE_EXISTING_USER', false),
          autoCreateUser: this.configService.get<boolean>('MAGIC_LINK_AUTO_CREATE_USER', true),
          redirectUrl: this.configService.get<string>('MAGIC_LINK_REDIRECT_URL', '/auth/success'),
          emailTemplate: this.configService.get<string>('MAGIC_LINK_EMAIL_TEMPLATE', 'magic-link')
        }
      };

      this.extendedAuthService = createExtendedAuthService(extendedConfig, authOptions);
      this.setupEventHandlers();
      this.isInitialized = true;
      
      this.logger.log('✅ Extended AuthService with MFA and Magic Link initialized successfully');
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize Extended AuthService:', error.message);
      throw error;
    }
  }


  async onModuleDestroy() {
    if (this.extendedAuthService && this.isInitialized) {
      try {
        await this.extendedAuthService.close();
        this.logger.log('AuthService destroyed successfully');
      } catch (error) {
        this.logger.error('Error during extendedAuthService destruction:', error.message);
      }
    }
  }



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
      const result = await this.extendedAuthService.registerUser(registrationData);
      
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
      
      const success = await this.extendedAuthService.verifyEmail(input.userId, input.token);
      
      if (success) {
        // Mettre à jour PostgreSQL avec les bonnes propriétés
        await this.postgresUserService.updateUser(input.userId, {
          emailVerified: true,  // ✅ Correction: emailVerified au lieu de email_verified
          verificationStatus: 'VERIFIED'  // ✅ Correction: verificationStatus au lieu de verification_status
        }).catch(error => {
          this.logger.warn(`Failed to update PostgreSQL for user ${input.userId}:`, error.message);
        });

        await this.emitUserManagementEvent({
          type: 'email_verified',
          userId: input.userId,
          success: true,
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
      
      const success = await this.extendedAuthService.resendVerificationEmail(input.userId);
      
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
      
      const success = await this.extendedAuthService.resetPassword(input.email);
      
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

      const success = await this.extendedAuthService.changePassword(input.userId, input.oldPassword, input.newPassword);
      
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
      const userData: UserCreationData = {
        username: input.username,
        email: input.email,
        emailVerified: input.emailVerified || false,  // ✅ Correction
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: input.enabled !== false,
        keycloakId: userId,
        state: 'ACTIVE',
        
        // Valeurs par défaut
        clearanceLevel: 1,
        hierarchyLevel: 1,
        employmentType: 'PERMANENT',
        verificationStatus: 'PENDING',
        riskScore: 0,
        technicalExpertise: [],
        certifications: [],
        customAttributes: input.attributes || {}
      };

      await this.postgresUserService.createUser(userData);
      this.logger.debug(`✅ User synced to PostgreSQL: ${input.username}`);
      
    } catch (error) {
      this.logger.warn(`⚠️ Failed to sync user to PostgreSQL:`, error.message);
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

  async loginWithMFA(
    username: string, 
    password: string, 
    deviceFingerprint?: string
  ): Promise<LoginWithMFAResult> {
    this.ensureInitialized();
    return this.extendedAuthService.loginWithMFA(username, password, deviceFingerprint);
  }

  async completeMFALogin(request: MFAVerificationRequest): Promise<LoginWithMFAResult> {
    this.ensureInitialized();
    return this.extendedAuthService.completeMFALogin(request);
  }

  async setupMFA(request: MFASetupRequest): Promise<MFASetupResult> {
    this.ensureInitialized();
    return this.extendedAuthService.setupMFA(request);
  }

  async verifyMFASetup(methodId: string, code: string): Promise<ValidationResult> {
    this.ensureInitialized();
    return this.extendedAuthService.verifyMFASetup(methodId, code);
  }

  async getUserMFAMethods(userId: string): Promise<MFAMethod[]> {
    this.ensureInitialized();
    return this.extendedAuthService.getUserMFAMethods(userId);
  }

  async removeMFAMethod(methodId: string): Promise<void> {
    this.ensureInitialized();
    return this.extendedAuthService.removeMFAMethod(methodId);
  }

  async generateBackupCodes(userId: string): Promise<BackupCodesGeneration> {
    this.ensureInitialized();
    return this.extendedAuthService.generateBackupCodes(userId);
  }

  async getRecoveryOptions(userId: string): Promise<RecoveryOptions> {
    this.ensureInitialized();
    return this.extendedAuthService.getRecoveryOptions(userId);
  }


  async trustDevice(userId: string, request: DeviceTrustRequest): Promise<DeviceTrustResult> {
    this.ensureInitialized();
    return this.extendedAuthService.trustDevice(userId, request);
  }

  async getTrustedDevices(userId: string): Promise<TrustedDevice[]> {
    this.ensureInitialized();
    return this.extendedAuthService.getTrustedDevices(userId);
  }

  async revokeTrustedDevice(deviceId: string): Promise<void> {
    this.ensureInitialized();
    return this.extendedAuthService.revokeTrustedDevice(deviceId);
  }

  async generateMagicLink(request: MagicLinkRequest): Promise<MagicLinkResult> {
    this.ensureInitialized();
    return this.extendedAuthService.generateMagicLink(request);
  }

  async verifyMagicLink(token: string): Promise<MagicLinkVerificationResult> {
    this.ensureInitialized();
    return this.extendedAuthService.verifyMagicLink(token);
  }

  async initiatePasswordlessLogin(request: PasswordlessAuthRequest): Promise<PasswordlessAuthResult> {
    this.ensureInitialized();
    return this.extendedAuthService.initiatePasswordlessLogin(request);
  }

  async startAuthenticationFlow(
    method: 'password' | 'magic_link' | 'passwordless',
    identifier: string,
    context?: Record<string, any>
  ): Promise<AuthenticationFlow> {
    this.ensureInitialized();
    return this.extendedAuthService.startAuthenticationFlow(method, identifier, context);
  }

  async getAuthenticationFlow(flowId: string): Promise<AuthenticationFlow | null> {
    this.ensureInitialized();
    return this.extendedAuthService.getAuthenticationFlow(flowId);
  }

  async loginWithOptions(options: {
    username?: string;
    password?: string;
    magicLinkToken?: string;
    mfaCode?: string;
    deviceFingerprint?: string;
    rememberDevice?: boolean;
  }): Promise<LoginWithMFAResult> {
    this.ensureInitialized();
    return this.extendedAuthService.loginWithOptions(options);
  }

  async login(username: string, password: string): Promise<AuthResponse> {
  this.ensureInitialized();
  
  try {
    this.logger.debug(`🔐 Attempting login for user: ${username}`);
    console.log('🔍 AUTH_SERVICE: Starting login process');
    
    // Authentification via Keycloak (UNE SEULE FOIS!)
    const result = await this.extendedAuthService.login(username, password);
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
      const result = await this.extendedAuthService.validateToken(token);
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
      const result = await this.extendedAuthService.refreshToken(refreshToken);
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
      const result = await this.extendedAuthService.getClientCredentialsToken();
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
      await this.extendedAuthService.logout(token);
      this.logger.debug('✅ Logout successful');
      
    } catch (error) {
      this.logger.error('❌ Logout failed:', error.message);
      // Ne pas throw pour logout, log seulement
    }
  }

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
      const userInfo = await this.extendedAuthService.getUserInfo(userId);
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
      const roles = await this.extendedAuthService.getUserRoles(userId);
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

  async checkPermission(
    token: string, 
    resourceId: string, 
    resourceType: string, 
    action: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const result = await this.extendedAuthService.checkPermission(token, resourceId, resourceType, action, context);
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
      const result = await this.extendedAuthService.checkPermissionDetailed(token, resourceId, resourceType, action, context);
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
 

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('AuthService not initialized. Please check configuration and external services.');
    }
  }

  private setupEventHandlers(): void {
    try {
      this.extendedAuthService.addEventListener('login', async (event: AuthEvent) => {
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

      this.extendedAuthService.addEventListener('logout', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'logout',
          userId: event.userId,
          success: event.success,
          duration: event.duration,
          details: event.details
        });
      });

      this.extendedAuthService.addEventListener('token_validation', async (event: AuthEvent) => {
        await this.eventLogger.logEvent({
          type: 'token_validation',
          userId: event.userId,
          success: event.success,
          duration: event.duration,
          error: event.error,
          details: event.details
        });
      });

      this.extendedAuthService.addEventListener('token_refresh', async (event: AuthEvent) => {
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
      // ✅ Créer les données utilisateur avec les propriétés requises
      const userData: UserCreationData = {
        username: userInfo.preferred_username || userInfo.sub,
        email: userInfo.email || '',
        emailVerified: userInfo.email_verified || false,
        firstName: userInfo.given_name,
        lastName: userInfo.family_name,
        enabled: true,
        keycloakId: userInfo.sub,
        
        // Mapper les attributs depuis userInfo.attributes si ils existent
        department: userInfo.attributes?.department as string,
        clearanceLevel: userInfo.attributes?.clearanceLevel as number || 1,
        contractExpiryDate: userInfo.attributes?.contractExpiryDate ? 
          new Date(userInfo.attributes.contractExpiryDate as string) : undefined,
        managerId: userInfo.attributes?.managerId as string,
        jobTitle: userInfo.attributes?.jobTitle as string,
        businessUnit: userInfo.attributes?.businessUnit as string,
        territorialJurisdiction: userInfo.attributes?.territorialJurisdiction as string,
        technicalExpertise: userInfo.attributes?.technicalExpertise as string[] || [],
        hierarchyLevel: userInfo.attributes?.hierarchyLevel as number || 1,
        workLocation: userInfo.attributes?.workLocation as string,
        employmentType: userInfo.attributes?.employmentType as string || 'PERMANENT',
        verificationStatus: userInfo.attributes?.verificationStatus as string || 'PENDING',
        riskScore: userInfo.attributes?.riskScore as number || 0,
        certifications: userInfo.attributes?.certifications as string[] || [],
        phoneNumber: userInfo.attributes?.phoneNumber as string,
        nationality: userInfo.attributes?.nationality as string,
        dateOfBirth: userInfo.attributes?.dateOfBirth ? 
          new Date(userInfo.attributes.dateOfBirth as string) : undefined,
        gender: userInfo.attributes?.gender as string,
        state: 'ACTIVE',
        
        // Attributs personnalisés (tout ce qui n'est pas dans les champs standards)
        customAttributes: this.extractCustomAttributes(userInfo.attributes || {})
      };

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

  private extractCustomAttributes(attributes: Record<string, any>): Record<string, any> {
    const standardAttributes = new Set([
      'department', 'clearanceLevel', 'contractExpiryDate', 'managerId',
      'jobTitle', 'businessUnit', 'territorialJurisdiction', 'technicalExpertise',
      'hierarchyLevel', 'workLocation', 'employmentType', 'verificationStatus',
      'riskScore', 'certifications', 'phoneNumber', 'nationality', 'dateOfBirth', 
      'gender', 'firstName', 'lastName'
    ]);

    const customAttributes: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      if (!standardAttributes.has(key)) {
        customAttributes[key] = value;
      }
    }

    return Object.keys(customAttributes).length > 0 ? customAttributes : {};
  }

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