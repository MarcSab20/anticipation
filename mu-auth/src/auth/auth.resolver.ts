import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthService } from './auth.service';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';

import { 
  // Types de base depuis smp-auth-ts
  MFAMethodType as SMPMFAMethodType,
  MFAChallenge,
} from 'smp-auth-ts';

import { MagicLinkIntegrationService } from './services/magic-link-integration.service';

import { LoginResponseDto } from './dto/login-response.dto';
import { LoginInputDto } from './dto/login-input.dto';
import { RefreshTokenInputDto } from './dto/refresh-token-input.dto';
import { 
  TokenValidationDto, 
  EnrichedTokenValidationDto, 
  UserInfoDto, 
  AuthenticationLogDto 
} from './dto/token-validation.dto';

import {
  MFASetupInputDto,
  MFAVerificationInputDto,
  MagicLinkRequestDto,
  PasswordlessAuthInputDto,
  MFASetupResultDto,
  MFAVerificationResultDto,
  MFAMethodDto,
  MFAChallengeDto,
  TrustedDeviceDto,
  MagicLinkResultDto,
  MagicLinkVerificationResultDto,
  PasswordlessAuthResultDto,
  DeviceTrustResultDto,
  DeviceTrustWithUserInputDto,
  BackupCodesGenerationDto,
  RecoveryOptionsDto,
  LoginWithMFAResultDto,
  LoginWithOptionsInputDto,
  PasswordValidationDto,
  UsernameValidationDto,
  EmailValidationDto,
  PasswordPolicyDto,
} from './dto/mfa-magic-link.dto';

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
} from './dto/user-registration.dto';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly validationService: UserRegistrationValidationService,
    private readonly magicLinkService: MagicLinkIntegrationService 
  ) {}

  @Mutation(() => LoginResponseDto)
  async login(
    @Args('input') input: LoginInputDto,
    @Context() context?: any
  ): Promise<LoginResponseDto> {
    const result = await this.authService.login(input.username, input.password);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      scope: result.scope,
      sessionId: result.session_id
    };
  }

  /**
   * Rafraîchissement de token
   */
  @Mutation(() => LoginResponseDto)
  async refreshToken(@Args('input') input: RefreshTokenInputDto): Promise<LoginResponseDto> {
    const result = await this.authService.refreshToken(input.refreshToken);
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      scope: result.scope
    };
  }

  /**
   * Obtenir un token client credentials
   */
  @Mutation(() => LoginResponseDto)
  async getClientCredentialsToken(): Promise<LoginResponseDto> {
    const result = await this.authService.getClientCredentialsToken();
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      scope: result.scope
    };
  }

  /**
   * Déconnexion utilisateur
   */
  @Mutation(() => Boolean)
  async logout(@Args('token') token: string): Promise<boolean> {
    try {
      await this.authService.logout(token);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Invalider le cache utilisateur
   */
  @Mutation(() => Boolean)
  async invalidateUserCache(@Args('userId') userId: string): Promise<boolean> {
    try {
      await this.authService.invalidateUserCache(userId);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enregistrement d'un nouvel utilisateur
   */
  @Mutation(() => UserRegistrationResponseDto)
  async registerUser(
    @Args('input') input: UserRegistrationInputDto,
    @Context() context?: any
  ): Promise<UserRegistrationResponseDto> {
    // Vérifier si l'enregistrement est autorisé
    if (!this.validationService.isRegistrationAllowed()) {
      return {
        success: false,
        message: 'User registration is currently disabled',
        errors: ['REGISTRATION_DISABLED']
      };
    }

    // Nettoyer les données d'entrée
    const sanitizedInput = this.validationService.sanitizeRegistrationData(input);
    
    return await this.authService.registerUser(sanitizedInput);
  }

  /**
   * Vérification d'email
   */
  @Mutation(() => EmailVerificationResponseDto)
  async verifyEmail(
    @Args('input') input: VerifyEmailInputDto
  ): Promise<EmailVerificationResponseDto> {
    return await this.authService.verifyEmail(input);
  }

  /**
   * Renvoi d'email de vérification
   */
  @Mutation(() => EmailVerificationResponseDto)
  async resendVerificationEmail(
    @Args('input') input: ResendVerificationInputDto
  ): Promise<EmailVerificationResponseDto> {
    return await this.authService.resendVerificationEmail(input);
  }

  /**
   * Demande de reset de mot de passe
   */
  @Mutation(() => PasswordResetResponseDto)
  async requestPasswordReset(
    @Args('input') input: ResetPasswordInputDto
  ): Promise<PasswordResetResponseDto> {
    return await this.authService.resetPassword(input);
  }

  /**
   * Changement de mot de passe
   */
  @Mutation(() => PasswordChangeResponseDto)
  async changePassword(
    @Args('input') input: ChangePasswordInputDto
  ): Promise<PasswordChangeResponseDto> {
    return await this.authService.changePassword(input);
  }

  @Query(() => TokenValidationDto)
  async validateToken(@Args('token') token: string): Promise<TokenValidationDto> {
    const result = await this.authService.validateToken(token);
    return {
      valid: result.valid,
      userId: result.userId,
      email: result.email,
      givenName: result.givenName,
      familyName: result.familyName,
      roles: result.roles,
      expiresAt: result.expiresAt,
      issuedAt: result.issuedAt,
      clientId: result.clientId,
      scope: result.scope
    };
  }

  /**
   * Validation enrichie de token
   */
  @Query(() => EnrichedTokenValidationDto)
  async validateTokenEnriched(@Args('token') token: string): Promise<EnrichedTokenValidationDto> {
    const result = await this.authService.validateTokenEnriched(token);
    
    let userInfoDto: UserInfoDto | undefined;
    if (result.userInfo) {
      userInfoDto = this.mapUserInfoToDto(result.userInfo);
    }

    return {
      valid: result.valid,
      userInfo: userInfoDto,
      userId: result.userId,
      email: result.email,
      givenName: result.givenName,
      familyName: result.familyName,
      roles: result.roles,
      rawKeycloakData: result.rawKeycloakData
    };
  }

  /**
   * Obtenir les informations utilisateur complètes
   */
  @Query(() => UserInfoDto, { nullable: true })
  async getUserInfo(@Args('userId') userId: string): Promise<UserInfoDto | null> {
    const userInfo = await this.authService.getUserInfo(userId);
    
    if (!userInfo) {
      return null;
    }

    return this.mapUserInfoToDto(userInfo);
  }

  /**
   * Obtenir les rôles d'un utilisateur
   */
  @Query(() => [String])
  async getUserRoles(@Args('userId') userId: string): Promise<string[]> {
    return await this.authService.getUserRoles(userId);
  }

  /**
   * Validation de mot de passe
   */
  @Query(() => PasswordValidationDto)
  async validatePassword(@Args('password') password: string): Promise<PasswordValidationDto> {
    const result = await this.validationService.validatePassword(password);
    return {
      valid: result.valid,
      score: result.score,
      errors: result.errors,
      suggestions: result.suggestions
    };
  }

  /**
   * Validation de nom d'utilisateur
   */
  @Query(() => UsernameValidationDto)
  async validateUsername(@Args('username') username: string): Promise<UsernameValidationDto> {
    const result = await this.validationService.validateUsername(username);
    return {
      valid: result.valid,
      available: result.available,
      errors: result.errors,
      suggestions: result.suggestions
    };
  }

  /**
   * Validation d'email
   */
  @Query(() => EmailValidationDto)
  async validateEmail(@Args('email') email: string): Promise<EmailValidationDto> {
    const result = await this.validationService.validateEmail(email);
    return {
      valid: result.valid,
      available: result.available,
      deliverable: result.deliverable,
      errors: result.errors
    };
  }

  /**
   * Génération de suggestions de nom d'utilisateur
   */
  @Query(() => [String])
  async generateUsernameSuggestions(
    @Args('email') email: string,
    @Args('firstName', { nullable: true }) firstName?: string,
    @Args('lastName', { nullable: true }) lastName?: string
  ): Promise<string[]> {
    return await this.validationService.generateUsernameSuggestions(email, firstName, lastName);
  }

  /**
   * Obtenir la politique de mot de passe
   */
  @Query(() => PasswordPolicyDto)
  async getPasswordPolicy(): Promise<PasswordPolicyDto> {
    const policy = this.validationService.getPasswordPolicy();
    return {
      minLength: policy.minLength,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireNumbers: policy.requireNumbers,
      requireSpecialChars: policy.requireSpecialChars,
      forbiddenPatterns: policy.forbiddenPatterns
    };
  }

  /**
   * Vérifier si l'enregistrement est autorisé
   */
  @Query(() => Boolean)
  async isRegistrationEnabled(): Promise<boolean> {
    return this.validationService.isRegistrationAllowed();
  }


  /**
   * Obtenir l'historique d'authentification
   */
  @Query(() => [AuthenticationLogDto])
  async getAuthenticationHistory(
    @Args('userId', { nullable: true }) userId?: string,
    @Args('limit', { nullable: true, defaultValue: 100 }) limit?: number,
    @Args('offset', { nullable: true, defaultValue: 0 }) offset?: number
  ): Promise<AuthenticationLogDto[]> {
    // Cette méthode pourrait être implémentée via EventLoggerService
    return [];
  }

  /**
   * Vérifier si un utilisateur est en ligne
   */
  @Query(() => Boolean)
  async isUserOnline(@Args('userId') userId: string): Promise<boolean> {
    // Cette logique devrait vérifier les sessions actives via smp-auth-ts
    return false;
  }

  /**
   * Vérifier les permissions (délégation vers authorization)
   */
  @Query(() => Boolean)
  async checkPermission(
    @Args('token') token: string,
    @Args('resourceId') resourceId: string,
    @Args('resourceType') resourceType: string,
    @Args('action') action: string,
    @Args('context', { nullable: true, type: () => GraphQLJSONObject }) context?: Record<string, any>
  ): Promise<boolean> {
    return await this.authService.checkPermission(token, resourceId, resourceType, action, context);
  }

  @Mutation(() => MFASetupResultDto)
  async setupMFA(@Args('input') input: MFASetupInputDto): Promise<MFASetupResultDto> {

  const methodType = input.methodType as 'totp' | 'sms' | 'email' | 'webauthn' | 'backup_codes';

  const result = await this.authService.setupMFA({
    userId: input.userId,
    methodType: methodType, 
    name: input.name,
    metadata: {
      phoneNumber: input.phoneNumber,
      emailAddress: input.emailAddress,
      deviceInfo: input.deviceInfo
    }
  });

  return {
    success: result.success,
    methodId: result.methodId,
    secret: result.secret,
    qrCodeUrl: result.qrCodeUrl,
    backupCodes: result.backupCodes,
    verificationRequired: result.verificationRequired,
    message: result.success ? 'MFA method setup successfully' : 'MFA setup failed'
  };
}

  @Mutation(() => MFAVerificationResultDto)
  async verifyMFASetup(
    @Args('methodId') methodId: string,
    @Args('code') code: string
  ): Promise<MFAVerificationResultDto> {
    const result = await this.authService.verifyMFASetup(methodId, code);
    
    return {
      success: result.valid,
      status: result.valid ? 'verified' : 'failed',
      message: result.valid ? 'MFA method verified successfully' : 'Verification failed'
    };
  }

  @Mutation(() => LoginWithMFAResultDto)
  async loginWithMFA(
    @Args('username') username: string,
    @Args('password') password: string,
    @Args('deviceFingerprint', { nullable: true }) deviceFingerprint?: string
  ): Promise<LoginWithMFAResultDto> {
    const result = await this.authService.loginWithMFA(username, password, deviceFingerprint);
    
    return {
      success: result.success,
      accessToken: result.authResponse?.access_token,
      refreshToken: result.authResponse?.refresh_token,
      tokenType: result.authResponse?.token_type,
      expiresIn: result.authResponse?.expires_in,
      scope: result.authResponse?.scope,
      sessionId: result.authResponse?.session_id,
      requiresMFA: result.requiresMFA,
      mfaChallenge: result.mfaChallenge ? this.convertMFAChallengeToDto(result.mfaChallenge) : undefined,
      trustedDevice: result.trustedDevice,
      message: result.message
    };
  }

  @Mutation(() => MFAVerificationResultDto)
  async verifyMFA(@Args('input') input: MFAVerificationInputDto): Promise<MFAVerificationResultDto> {
    const result = await this.authService.completeMFALogin({
      challengeId: input.challengeId,
      code: input.code,
      deviceFingerprint: input.deviceFingerprint,
      rememberDevice: input.rememberDevice,
      metadata: input.metadata
    });

    return {
      success: result.success,
      status: result.success ? 'verified' : 'failed',
      message: result.message,
      
      attemptsRemaining: undefined, 
      nextAttemptAt: undefined, 
      deviceTrusted: result.trustedDevice 
    };
  }

  @Mutation(() => Boolean)
  async removeMFAMethod(@Args('methodId') methodId: string): Promise<boolean> {
    try {
      await this.authService.removeMFAMethod(methodId);
      return true;
    } catch (error) {
      return false;
    }
  }

  @Mutation(() => BackupCodesGenerationDto)
  async generateBackupCodes(@Args('userId') userId: string): Promise<BackupCodesGenerationDto> {
    const result = await this.authService.generateBackupCodes(userId);
    
    return {
      userId: result.userId,
      codes: result.codes,
      generatedAt: result.generatedAt,
      remainingCodes: result.remainingCodes,
      message: 'Backup codes generated successfully. Store them securely!'
    };
  }

  @Mutation(() => DeviceTrustResultDto)
async trustDevice(@Args('input') input: DeviceTrustWithUserInputDto): Promise<DeviceTrustResultDto> {
  const result = await this.authService.trustDevice(input.userId, {
    deviceFingerprint: input.deviceFingerprint,
    deviceName: input.deviceName,
    trustDurationDays: input.trustDurationDays,
    requireMFAConfirmation: input.requireMFAConfirmation
  });

  return {
    success: result.success,
    deviceId: result.deviceId,
    trusted: result.trusted,
    expiresAt: result.expiresAt,
    mfaRequired: result.mfaRequired,
    message: result.success ? 'Device trusted successfully' : 'Failed to trust device'
  };
}

  @Mutation(() => Boolean)
  async revokeTrustedDevice(@Args('deviceId') deviceId: string): Promise<boolean> {
    try {
      await this.authService.revokeTrustedDevice(deviceId);
      return true;
    } catch (error) {
      return false;
    }
  }


  @Mutation(() => MagicLinkResultDto)
  async generateMagicLink(@Args('input') input: MagicLinkRequestDto): Promise<MagicLinkResultDto> {
    try {
      const action: "login" | "register" | "reset_password" | "verify_email" = 
        input.context?.action === 'register' ? 'register' :
        input.context?.action === 'reset_password' ? 'reset_password' :
        input.context?.action === 'verify_email' ? 'verify_email' : 'login';

      const result = await this.authService.generateMagicLink({
        email: input.email,
        redirectUrl: input.redirectUrl,
        context: {
          ip: input.context?.ip,
          userAgent: input.context?.userAgent,
          deviceFingerprint: input.context?.deviceFingerprint,
          referrer: input.context?.referrer,
          action: action
        },
        metadata: input.metadata
      });

      return {
        success: result.success,
        linkId: result.linkId,
        message: result.message,
        expiresAt: result.expiresAt,
        emailSent: result.emailSent
      };
    } catch (error) {
      console.log('Failed to generate magic link:', error.message);
      
      return {
        success: false,
        message: error.message || 'Failed to generate magic link',
        linkId: undefined,
        expiresAt: undefined,
        emailSent: false
      };
    }
  }

  @Mutation(() => MagicLinkVerificationResultDto)
  async verifyMagicLink(@Args('token') token: string): Promise<MagicLinkVerificationResultDto> {
    try {
      const result = await this.authService.verifyMagicLink(token);

      return {
        success: result.success,
        status: result.status,
        message: result.message,
        accessToken: result.authResponse?.access_token,
        refreshToken: result.authResponse?.refresh_token,
        tokenType: result.authResponse?.token_type,
        expiresIn: result.authResponse?.expires_in,
        requiresMFA: result.requiresMFA,
        mfaChallenge: result.mfaChallenge ? this.convertMFAChallengeToDto(result.mfaChallenge) : undefined,
        userInfo: result.userInfo
      };
    } catch (error) {
      console.log('Magic link verification failed:', error.message);
      
      
      return {
        success: false,
        status: 'failed',
        message: error.message || 'Magic link verification failed',
        accessToken: undefined,
        refreshToken: undefined,
        tokenType: undefined,
        expiresIn: undefined,
        requiresMFA: false,
        mfaChallenge: undefined,
        userInfo: undefined
      };
    }
  }

  @Mutation(() => PasswordlessAuthResultDto)
  async initiatePasswordlessAuth(@Args('input') input: PasswordlessAuthInputDto): Promise<PasswordlessAuthResultDto> {
    try {
      
      const method: 'magic_link' | 'sms' | 'email_code' = 
        input.method === 'sms' ? 'sms' :
        input.method === 'email_code' ? 'email_code' : 'magic_link';

      const action: 'login' | 'register' = input.action === 'register' ? 'register' : 'login';

      const result = await this.authService.initiatePasswordlessLogin({
        identifier: input.identifier,
        method: method,
        action: action,
        redirectUrl: input.redirectUrl,
        context: {
          ip: input.context?.ip,
          userAgent: input.context?.userAgent,
          deviceFingerprint: input.context?.deviceFingerprint
        }
      });

      return {
        success: result.success,
        method: result.method,
        challengeId: result.challengeId,
        linkId: result.linkId,
        message: result.message,
        expiresAt: result.expiresAt,
        maskedDestination: result.maskedDestination
      };
    } catch (error) {
      console.log('Failed to initiate passwordless auth:', error.message);
      
      return {
        success: false,
        method: input.method,
        challengeId: undefined,
        linkId: undefined,
        message: error.message || 'Failed to initiate passwordless authentication',
        expiresAt: undefined,
        maskedDestination: undefined
      };
    }
  }

  @Mutation(() => Boolean)
  async revokeMagicLink(@Args('linkId') linkId: string): Promise<boolean> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return false;
      }

      await this.magicLinkService.revokeMagicLink(linkId);
      return true;
    } catch (error) {
      console.error('Failed to revoke magic link:', error);
      return false;
    }
  }

  @Mutation(() => Number)
  async cleanupExpiredMagicLinks(): Promise<number> {
    try {
      if (!this.magicLinkService.isEnabled()) {
        return 0;
      }

      return await this.magicLinkService.cleanupExpiredLinks();
    } catch (error) {
      console.error('Failed to cleanup expired magic links:', error);
      return 0;
    }
}

  @Mutation(() => LoginWithMFAResultDto)
  async loginWithOptions(@Args('input') input: LoginWithOptionsInputDto): Promise<LoginWithMFAResultDto> {
    const result = await this.authService.loginWithOptions({
      username: input.username,
      password: input.password,
      magicLinkToken: input.magicLinkToken,
      mfaCode: input.mfaCode,
      deviceFingerprint: input.deviceFingerprint,
      rememberDevice: input.rememberDevice
    });

    return {
      success: result.success,
      accessToken: result.authResponse?.access_token,
      refreshToken: result.authResponse?.refresh_token,
      tokenType: result.authResponse?.token_type,
      expiresIn: result.authResponse?.expires_in,
      scope: result.authResponse?.scope,
      sessionId: result.authResponse?.session_id,
      requiresMFA: result.requiresMFA,
      mfaChallenge: result.mfaChallenge ? this.convertMFAChallengeToDto(result.mfaChallenge) : undefined,
      trustedDevice: result.trustedDevice,
      message: result.message
    };
  }

  @Query(() => [MFAMethodDto])
  async getUserMFAMethods(@Args('userId') userId: string): Promise<MFAMethodDto[]> {
    const methods = await this.authService.getUserMFAMethods(userId);
    
    return methods.map(method => ({
      id: method.id,
      userId: method.userId,
      type: method.type as any, 
      name: method.name,
      isEnabled: method.isEnabled,
      isPrimary: method.isPrimary,
      isVerified: method.isVerified,
      createdAt: method.createdAt,
      lastUsedAt: method.lastUsedAt,
      metadata: this.sanitizeMethodMetadata(method.metadata)
    }));
  }

  @Query(() => RecoveryOptionsDto)
  async getRecoveryOptions(@Args('userId') userId: string): Promise<RecoveryOptionsDto> {
    const options = await this.authService.getRecoveryOptions(userId);
    
    return {
      hasBackupCodes: options.hasBackupCodes,
      backupCodesRemaining: options.backupCodesRemaining,
      hasRecoveryEmail: options.hasRecoveryEmail,
      hasRecoveryPhone: options.hasRecoveryPhone,
      recoveryMethods: options.recoveryMethods.map(method => method as any)
    };
  }

  @Query(() => [TrustedDeviceDto])
  async getTrustedDevices(@Args('userId') userId: string): Promise<TrustedDeviceDto[]> {
    const devices = await this.authService.getTrustedDevices(userId);
    
    return devices.map(device => ({
      id: device.id,
      userId: device.userId,
      fingerprint: device.fingerprint.substring(0, 8) + '...', // Masquer pour la sécurité
      name: device.name,
      platform: device.platform,
      browser: device.browser,
      ip: device.ip,
      isActive: device.isActive,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt,
      expiresAt: device.expiresAt
    }));
  }

  @Query(() => Boolean)
  async isDeviceTrusted(
    @Args('userId') userId: string,
    @Args('deviceFingerprint') deviceFingerprint: string
  ): Promise<boolean> {
    const devices = await this.authService.getTrustedDevices(userId);
    return devices.some(device => 
      device.fingerprint === deviceFingerprint && 
      device.isActive && 
      (!device.expiresAt || new Date() < new Date(device.expiresAt))
    );
  }

  private sanitizeMethodMetadata(metadata: any): any {
    if (!metadata) return {};

    const sanitized = { ...metadata };

    delete sanitized.secret;

    if (sanitized.phoneNumber) {
      sanitized.phoneNumber = this.maskPhone(sanitized.phoneNumber);
    }

    if (sanitized.emailAddress) {
      sanitized.emailAddress = this.maskEmail(sanitized.emailAddress);
    }
    
    return sanitized;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
  }

  private maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;
    return username.slice(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  private mapUserInfoToDto(userInfo: any): UserInfoDto {
    return {
      sub: userInfo.sub,
      email: userInfo.email,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      preferred_username: userInfo.preferred_username,
      roles: userInfo.roles || [],
      organization_ids: userInfo.organization_ids,
      state: userInfo.state,
      attributes: userInfo.attributes ? {
        department: userInfo.attributes.department,
        clearanceLevel: userInfo.attributes.clearanceLevel,
        contractExpiryDate: userInfo.attributes.contractExpiryDate,
        managerId: userInfo.attributes.managerId,
        jobTitle: userInfo.attributes.jobTitle,
        businessUnit: userInfo.attributes.businessUnit,
        workLocation: userInfo.attributes.workLocation,
        employmentType: userInfo.attributes.employmentType,
        verificationStatus: userInfo.attributes.verificationStatus,
        riskScore: userInfo.attributes.riskScore,
        firstName: userInfo.attributes.firstName,
        lastName: userInfo.attributes.lastName,
        phoneNumber: userInfo.attributes.phoneNumber,
        nationality: userInfo.attributes.nationality,
        dateOfBirth: userInfo.attributes.dateOfBirth,
        gender: userInfo.attributes.gender,
        additionalAttributes: userInfo.attributes
      } : undefined,
      resource_access: userInfo.resource_access,
      realm_access: userInfo.realm_access,
      created_at: userInfo.created_at,
      updated_at: userInfo.updated_at,
      email_verified: userInfo.email_verified
    };
  }

  private convertMFAChallengeToDto(challenge: MFAChallenge): MFAChallengeDto {
    return {
      id: challenge.id,
      userId: challenge.userId,
      methodId: challenge.methodId,
      methodType: challenge.methodType as any, // Cast pour compatibilité GraphQL
      status: challenge.status,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt,
      attemptsRemaining: challenge.attemptsRemaining,
      metadata: challenge.metadata
    };
  }
}

