import { AuthService } from './auth.service.js';
import { MFAServiceImpl } from './mfa.service.js';
import { MagicLinkServiceImpl } from './magic-link.service.js';
import {
  AuthConfig,
  AuthorizationResult
} from '../interface/common.js';
import {
  IAuthenticationService,
  AuthResponse,
  TokenValidationResult,
  UserInfo,
  AuthenticationOptions,
  AuthEvent,
  EventCallback,
  AuthEventType,
  UserRegistrationData,
  UserRegistrationResult
} from '../interface/auth.interface.js';
import {
  MFAService,
  MagicLinkService,
  PasswordlessAuthService,
  MFAConfig,
  MagicLinkConfig,
  MFAMethod,
  MFAChallenge,
  MFAVerificationRequest,
  MFAVerificationResult,
  MFASetupRequest,
  MFASetupResult,
  MagicLinkRequest,
  MagicLinkResult,
  MagicLinkVerificationResult,
  PasswordlessAuthRequest,
  PasswordlessAuthResult,
  TrustedDevice,
  DeviceTrustRequest,
  DeviceTrustResult,
  MFAStatus,
  BackupCodesGeneration,
  RecoveryOptions,
} from '../interface/mfa.interface.js';
import { ValidationResult, UserId } from '../interface/common.js';

export interface ExtendedAuthConfig extends AuthConfig {
  mfa?: Partial<MFAConfig>;
  magicLink?: Partial<MagicLinkConfig>;
}

export interface ExtendedAuthOptions extends AuthenticationOptions {
  enableMFA?: boolean;
  enableMagicLink?: boolean;
  enableDeviceTrust?: boolean;
}

export interface LoginWithMFAResult {
  success: boolean;
  authResponse?: AuthResponse;
  requiresMFA?: boolean;
  mfaChallenge?: MFAChallenge;
  trustedDevice?: boolean;
  message?: string;
}

export interface AuthenticationFlow {
  flowId: string;
  userId?: UserId;
  email?: string;
  step: 'credentials' | 'mfa' | 'device_trust' | 'completed';
  method: 'password' | 'magic_link' | 'passwordless';
  mfaRequired: boolean;
  mfaCompleted: boolean;
  deviceTrusted: boolean;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, any>;
}

export class ExtendedAuthService implements IAuthenticationService {
  private readonly baseAuthService: AuthService;
  private readonly mfaService: MFAService | null = null;
  private readonly magicLinkService: (MagicLinkService & PasswordlessAuthService) | null = null;
  private readonly options: ExtendedAuthOptions;

  constructor(config: ExtendedAuthConfig, options: ExtendedAuthOptions = {}) {
    // Initialiser le service de base
    this.baseAuthService = new AuthService(config, options);
    
    this.options = {
      enableMFA: true,
      enableMagicLink: true,
      enableDeviceTrust: true,
      ...options
    };

    // Initialiser les services étendus conditionnellement
    if (this.options.enableMFA) {
      this.mfaService = new MFAServiceImpl(
        this.baseAuthService['redisClient'], // Accès au client Redis
        config.mfa
      ) as MFAService;
    }

    if (this.options.enableMagicLink) {
      this.magicLinkService = new MagicLinkServiceImpl(
        this.baseAuthService['redisClient'],
        this.baseAuthService['keycloakClient'],
        config.magicLink
      ) as MagicLinkService & PasswordlessAuthService;
    }

    this.setupEventHandlers();
  }

  // ============================================================================
  // MÉTHODES D'AUTHENTIFICATION DE BASE (Délégation)
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.baseAuthService.login(username, password);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    return this.baseAuthService.refreshToken(refreshToken);
  }

  async logout(token: string): Promise<void> {
    return this.baseAuthService.logout(token);
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    return this.baseAuthService.validateToken(token);
  }

  async getClientCredentialsToken(): Promise<AuthResponse> {
    return this.baseAuthService.getClientCredentialsToken();
  }

  async getUserInfo(userId: string): Promise<UserInfo | null> {
    return this.baseAuthService.getUserInfo(userId);
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return this.baseAuthService.getUserRoles(userId);
  }

  async registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult> {
    return this.baseAuthService.registerUser(userData);
  }

  async verifyEmail(userId: string, token: string): Promise<boolean> {
    return this.baseAuthService.verifyEmail(userId, token);
  }

  async resendVerificationEmail(userId: string): Promise<boolean> {
    return this.baseAuthService.resendVerificationEmail(userId);
  }

  async resetPassword(email: string): Promise<boolean> {
    return this.baseAuthService.resetPassword(email);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    return this.baseAuthService.changePassword(userId, oldPassword, newPassword);
  }

  async checkPermission(token: string, resourceId: string, resourceType: string, action: string, context?: Record<string, any>): Promise<boolean> {
    return this.baseAuthService.checkPermission(token, resourceId, resourceType, action, context);
  }

  async checkPermissionDetailed(token: string, resourceId: string, resourceType: string, action: string, context?: Record<string, any>): Promise<AuthorizationResult> {
    return this.baseAuthService.checkPermissionDetailed(token, resourceId, resourceType, action, context);
  }


  addEventListener(eventType: AuthEventType, callback: EventCallback): void {
    return this.baseAuthService.addEventListener(eventType, callback);
  }

  removeEventListener(eventType: AuthEventType, callback: EventCallback): void {
    return this.baseAuthService.removeEventListener(eventType, callback);
  }

  async close(): Promise<void> {
    return this.baseAuthService.close();
  }

  async loginWithMFA(
    username: string, 
    password: string, 
    deviceFingerprint?: string
  ): Promise<LoginWithMFAResult> {
    try {
      const authResponse = await this.login(username, password);

      const tokenValidation = await this.validateToken(authResponse.access_token);
      if (!tokenValidation.valid || !tokenValidation.userId) {
        return {
          success: false,
          message: 'Authentication failed'
        };
      }

      const userId = tokenValidation.userId;

      let deviceTrusted = false;
      if (this.options.enableDeviceTrust && deviceFingerprint && this.mfaService) {
        deviceTrusted = await this.mfaService.isDeviceTrusted(userId, deviceFingerprint);
      }

      if (!this.options.enableMFA || !this.mfaService) {
        return {
          success: true,
          authResponse,
          requiresMFA: false,
          trustedDevice: deviceTrusted
        };
      }

      const mfaChallenge = await this.mfaService.initiateMFAChallenge(userId);

      return {
        success: true,
        requiresMFA: true,
        mfaChallenge,
        trustedDevice: deviceTrusted,
        message: 'MFA verification required'
      };

    } catch (error) {
      return {
        success: false,
        message: `Login failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async completeMFALogin(
    mfaRequest: MFAVerificationRequest
  ): Promise<LoginWithMFAResult> {
    if (!this.mfaService) {
      return {
        success: false,
        message: 'MFA service not available'
      };
    }

    try {
      const mfaResult = await this.mfaService.verifyMFAChallenge(mfaRequest);
      
      if (!mfaResult.success) {
        return {
          success: false,
          message: mfaResult.message
        };
      }

      const authResponse = await this.getClientCredentialsToken();

      return {
        success: true,
        authResponse,
        requiresMFA: false,
        trustedDevice: mfaResult.deviceTrusted,
        message: 'Authentication completed successfully'
      };

    } catch (error) {
      return {
        success: false,
        message: `MFA completion failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async initiatePasswordlessLogin(request: PasswordlessAuthRequest): Promise<PasswordlessAuthResult> {
    if (!this.options.enableMagicLink || !this.magicLinkService) {
      return {
        success: false,
        method: request.method,
        message: 'Passwordless authentication is disabled'
      };
    }

    return this.magicLinkService.initiatePasswordlessAuth(request);
  }

  async verifyPasswordlessLogin(token: string): Promise<MagicLinkVerificationResult> {
    if (!this.options.enableMagicLink || !this.magicLinkService) {
      return {
        success: false,
        status: 'expired',
        message: 'Passwordless authentication is disabled'
      };
    }

    return this.magicLinkService.verifyMagicLink(token);
  }

  async setupMFA(request: MFASetupRequest): Promise<MFASetupResult> {
    if (!this.options.enableMFA || !this.mfaService) {
      return {
        success: false,
        verificationRequired: false
      };
    }

    return this.mfaService.setupMFAMethod(request);
  }

  async verifyMFASetup(methodId: string, code: string): Promise<ValidationResult> {
    if (!this.options.enableMFA || !this.mfaService) {
      return { valid: false, errors: ['MFA is disabled'] };
    }

    return this.mfaService.verifyMFASetup(methodId, code);
  }

  async getUserMFAMethods(userId: UserId): Promise<MFAMethod[]> {
    if (!this.options.enableMFA || !this.mfaService) {
      return [];
    }

    return this.mfaService.getUserMFAMethods(userId);
  }

  async removeMFAMethod(methodId: string): Promise<void> {
    if (!this.options.enableMFA || !this.mfaService) {
      throw new Error('MFA is disabled');
    }

    return this.mfaService.removeMFAMethod(methodId);
  }

  async generateBackupCodes(userId: UserId): Promise<BackupCodesGeneration> {
    if (!this.options.enableMFA || !this.mfaService) {
      throw new Error('MFA is disabled');
    }

    return this.mfaService.generateBackupCodes(userId);
  }

  async getRecoveryOptions(userId: UserId): Promise<RecoveryOptions> {
    if (!this.options.enableMFA || !this.mfaService) {
      return {
        hasBackupCodes: false,
        backupCodesRemaining: 0,
        hasRecoveryEmail: false,
        hasRecoveryPhone: false,
        recoveryMethods: []
      };
    }

    return this.mfaService.getRecoveryOptions(userId);
  }

  async trustDevice(userId: UserId, request: DeviceTrustRequest): Promise<DeviceTrustResult> {
    if (!this.options.enableDeviceTrust || !this.mfaService) {
      return {
        success: false,
        trusted: false,
        mfaRequired: true
      };
    }

    return this.mfaService.trustDevice(userId, request);
  }

  async getTrustedDevices(userId: UserId): Promise<TrustedDevice[]> {
    if (!this.options.enableDeviceTrust || !this.mfaService) {
      return [];
    }

    return this.mfaService.getTrustedDevices(userId);
  }

  async revokeTrustedDevice(deviceId: string): Promise<void> {
    if (!this.options.enableDeviceTrust || !this.mfaService) {
      throw new Error('Device trust is disabled');
    }

    return this.mfaService.revokeTrustedDevice(deviceId);
  }

 
  async generateMagicLink(request: MagicLinkRequest): Promise<MagicLinkResult> {
    if (!this.options.enableMagicLink || !this.magicLinkService) {
      return {
        success: false,
        message: 'Magic link authentication is disabled'
      };
    }

    return this.magicLinkService.generateMagicLink(request);
  }

  async verifyMagicLink(token: string): Promise<MagicLinkVerificationResult> {
    if (!this.options.enableMagicLink || !this.magicLinkService) {
      return {
        success: false,
        status: 'expired',
        message: 'Magic link authentication is disabled'
      };
    }

    return this.magicLinkService.verifyMagicLink(token);
  }

  async startAuthenticationFlow(
    method: 'password' | 'magic_link' | 'passwordless',
    identifier: string,
    context?: Record<string, any>
  ): Promise<AuthenticationFlow> {
    const flowId = this.generateFlowId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    const flow: AuthenticationFlow = {
      flowId,
      email: method !== 'password' ? identifier : undefined,
      step: 'credentials',
      method,
      mfaRequired: false,
      mfaCompleted: false,
      deviceTrusted: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: context
    };

    // Stocker le flow
    await this.baseAuthService['redisClient'].set(
      `auth_flow:${flowId}`,
      JSON.stringify(flow),
      { ttl: 30 * 60 }
    );

    return flow;
  }

  async getAuthenticationFlow(flowId: string): Promise<AuthenticationFlow | null> {
    try {
      const flowData = await this.baseAuthService['redisClient'].get(`auth_flow:${flowId}`);
      return flowData ? JSON.parse(flowData) : null;
    } catch (error) {
      return null;
    }
  }

  async updateAuthenticationFlow(flowId: string, updates: Partial<AuthenticationFlow>): Promise<void> {
    const flow = await this.getAuthenticationFlow(flowId);
    if (!flow) {
      throw new Error('Authentication flow not found');
    }

    const updatedFlow = { ...flow, ...updates };
    
    await this.baseAuthService['redisClient'].set(
      `auth_flow:${flowId}`,
      JSON.stringify(updatedFlow),
      { ttl: 30 * 60 }
    );
  }

  async completeAuthenticationFlow(flowId: string): Promise<void> {
    await this.updateAuthenticationFlow(flowId, {
      step: 'completed'
    });
  }

  async loginWithOptions(options: {
    username?: string;
    password?: string;
    magicLinkToken?: string;
    mfaCode?: string;
    deviceFingerprint?: string;
    rememberDevice?: boolean;
  }): Promise<LoginWithMFAResult> {
    try {
      if (options.magicLinkToken) {
        const magicLinkResult = await this.verifyMagicLink(options.magicLinkToken);
        if (magicLinkResult.success) {
          return {
            success: true,
            authResponse: magicLinkResult.authResponse,
            requiresMFA: magicLinkResult.requiresMFA,
            mfaChallenge: magicLinkResult.mfaChallenge
          };
        }
        return { success: false, message: magicLinkResult.message };
      }

      if (options.username && options.password) {
        return this.loginWithMFA(options.username, options.password, options.deviceFingerprint);
      }

      return {
        success: false,
        message: 'Invalid login options provided'
      };

    } catch (error) {
      return {
        success: false,
        message: `Login failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }


  private setupEventHandlers(): void {

    if (this.options.enableMFA && this.mfaService) {
      if ('addEventListener' in this.mfaService) {
        (this.mfaService as any).addEventListener('mfa_verification_success', async (event: any) => {
          await this.emitAuthEvent({
            type: 'login',
            userId: event.userId,
            success: true,
            timestamp: event.timestamp,
            details: {
              method: 'mfa',
              mfaType: event.data.methodType
            }
          });
        });
      }
    }

    if (this.options.enableMagicLink && this.magicLinkService) {
      if ('addEventListener' in this.magicLinkService) {
        (this.magicLinkService as any).addEventListener('magic_link_used', async (event: any) => {
          await this.emitAuthEvent({
            type: 'login',
            userId: event.userId,
            success: true,
            timestamp: event.timestamp,
            details: {
              method: 'magic_link',
              email: event.data.email
            }
          });
        });
      }
    }
  }

  private async emitAuthEvent(event: Omit<AuthEvent, 'id'>): Promise<void> {
    const callbacks = this.baseAuthService['eventCallbacks']?.get(event.type);
    if (callbacks) {
      const fullEvent: AuthEvent = {
        ...event,
        id: this.generateId()
      };

      for (const callback of callbacks) {
        try {
          await callback(fullEvent);
        } catch (error) {
          console.error(`Extended auth event callback error:`, error);
        }
      }
    }
  }

  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function createExtendedAuthService(
  config: ExtendedAuthConfig,
  options: ExtendedAuthOptions = {}
): ExtendedAuthService {
  return new ExtendedAuthService(config, options);
}

export interface AuthenticationSession {
  sessionId: string;
  userId: UserId;
  flowId?: string;
  method: 'password' | 'magic_link' | 'mfa' | 'passwordless';
  deviceFingerprint?: string;
  deviceTrusted: boolean;
  mfaCompleted: boolean;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  metadata?: Record<string, any>;
}