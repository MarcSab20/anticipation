// mu-auth/src/auth/auth.controller.ts - Version étendue avec gestion des utilisateurs
import { 
  Controller, 
  Post, 
  Get,
  Body, 
  Delete,
  Headers, 
  Logger, 
  HttpException, 
  HttpStatus, 
  Param, 
  Query,
  UsePipes,
  ValidationPipe,
  Req
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { EventLoggerService } from './services/event-logger.service';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';

// DTOs existants
import { LoginInputDto } from './dto/login-input.dto';
import { RefreshTokenInputDto } from './dto/refresh-token-input.dto';
import {
  MFASetupInputDto,
  MFAVerificationInputDto,
  MagicLinkRequestDto,
  PasswordlessAuthInputDto,
  DeviceTrustInputDto,
  LoginWithOptionsInputDto
} from './dto/mfa-magic-link.dto';
// Nouveaux DTOs pour la gestion des utilisateurs
import {
  UserRegistrationInputDto,
  UserRegistrationResponseDto,
  EmailVerificationResponseDto,
  PasswordResetResponseDto,
  PasswordChangeResponseDto,
  VerifyEmailInputDto,
  ResetPasswordInputDto,
  ChangePasswordInputDto,
  ResendVerificationInputDto
} from './dto/user-registration.dto';

import { MFAMethodType } from 'smp-auth-ts';
import { MagicLinkIntegrationService } from './services/magic-link-integration.service';
@Controller('auth')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService, 
    private readonly eventLogger: EventLoggerService,
    private readonly validationService: UserRegistrationValidationService,
     private readonly magicLinkService: MagicLinkIntegrationService
  ) {}

  // ============================================================================
  // ENDPOINTS D'AUTHENTIFICATION EXISTANTS
  // ============================================================================

    @Post('login')
  async login(@Body() body: LoginInputDto) {
    try {
      const result = await this.authService.login(body.username, body.password);
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in,
          scope: result.scope,
          sessionId: result.session_id
        }
      };
    } catch (error) {
      //this.logger.error(`Login failed for user ${body.username}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Authentication failed',
          error: error.message 
        }, 
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Rafraîchissement de token
   */
  @Post('refresh')
  async refreshToken(@Body() body: RefreshTokenInputDto) {
    try {
      const result = await this.authService.refreshToken(body.refreshToken);
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in
        }
      };
    } catch (error) {
      this.logger.error('Token refresh failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Token refresh failed',
          error: error.message 
        }, 
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  /**
   * Déconnexion utilisateur
   */
  @Post('logout')
  async logout(@Headers('authorization') authHeader: string) {
    try {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException('Token required', HttpStatus.BAD_REQUEST);
      }

      const token = authHeader.substring(7);
      await this.authService.logout(token);
      
      return {
        success: true,
        message: 'Logout successful'
      };
    } catch (error) {
      this.logger.error('Logout failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Logout failed',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Validation de nom d'utilisateur
   */
  @Post('validate-username')
  async validateUsername(@Body() body: { username: string }) {
    try {
      const result = await this.validationService.validateUsername(body.username);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Username validation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validation d'email
   */
  @Post('validate-email')
  async validateEmail(@Body() body: { email: string }) {
    try {
      const result = await this.validationService.validateEmail(body.email);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Email validation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Génération de suggestions de nom d'utilisateur
   */
  @Post('generate-username-suggestions')
  async generateUsernameSuggestions(@Body() body: { 
    email: string; 
    firstName?: string; 
    lastName?: string 
  }) {
    try {
      const suggestions = await this.validationService.generateUsernameSuggestions(
        body.email, 
        body.firstName, 
        body.lastName
      );
      
      return {
        success: true,
        data: { suggestions }
      };
    } catch (error) {
      this.logger.error('Username suggestions generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post('register')
  async registerUser(@Body() body: UserRegistrationInputDto): Promise<{
    success: boolean;
    data?: UserRegistrationResponseDto;
    message?: string;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Registration attempt for user: ${body.username}`);

      // Vérifier si l'enregistrement est autorisé
      if (!this.validationService.isRegistrationAllowed()) {
        return {
          success: false,
          message: 'User registration is currently disabled',
          errors: ['REGISTRATION_DISABLED']
        };
      }

      // Nettoyer et valider les données
      const sanitizedInput = this.validationService.sanitizeRegistrationData(body);
      const result = await this.authService.registerUser(sanitizedInput);
      
      return {
        success: result.success,
        data: result,
        message: result.message
      };

    } catch (error) {
      this.logger.error(`Registration failed for user ${body.username}:`, error.message);
      throw new HttpException(
        {
          success: false,
          message: 'Registration failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Vérification d'email
   */
  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailInputDto): Promise<{
    success: boolean;
    data?: EmailVerificationResponseDto;
  }> {
    try {
      const result = await this.authService.verifyEmail(body);
      
      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error(`Email verification failed for user ${body.userId}:`, error.message);
      throw new HttpException(
        {
          success: false,
          message: 'Email verification failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Renvoi d'email de vérification
   */
  @Post('resend-verification')
  async resendVerificationEmail(@Body() body: ResendVerificationInputDto): Promise<{
    success: boolean;
    data?: EmailVerificationResponseDto;
  }> {
    try {
      const result = await this.authService.resendVerificationEmail(body);
      
      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error(`Failed to resend verification email for user ${body.userId}:`, error.message);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to resend verification email',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Demande de reset de mot de passe
   */
  @Post('request-password-reset')
  async requestPasswordReset(@Body() body: ResetPasswordInputDto): Promise<{
    success: boolean;
    data?: PasswordResetResponseDto;
  }> {
    try {
      const result = await this.authService.resetPassword(body);
      
      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error(`Password reset request failed for email ${body.email}:`, error.message);
      throw new HttpException(
        {
          success: false,
          message: 'Password reset request failed',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Changement de mot de passe
   */
  @Post('change-password')
  async changePassword(
    @Headers('authorization') authHeader: string,
    @Body() body: ChangePasswordInputDto
  ): Promise<{
    success: boolean;
    data?: PasswordChangeResponseDto;
  }> {
    try {
      // Optionnel: vérifier que l'utilisateur est authentifié
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tokenValidation = await this.authService.validateToken(token);
        
        if (!tokenValidation.valid || tokenValidation.userId !== body.userId) {
          throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
      }

      const result = await this.authService.changePassword(body);
      
      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error(`Password change failed for user ${body.userId}:`, error.message);
      throw new HttpException(
        {
          success: false,
          message: 'Password change failed',
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }


  /**
   * Obtenir la politique de mot de passe
   */
  @Get('password-policy')
  async getPasswordPolicy() {
    try {
      const policy = this.validationService.getPasswordPolicy();
      
      return {
        success: true,
        data: policy
      };
    } catch (error) {
      this.logger.error('Failed to get password policy:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Vérifier si l'enregistrement est autorisé
   */
  @Get('registration-status')
  async getRegistrationStatus() {
    try {
      const enabled = this.validationService.isRegistrationAllowed();
      const requiresEmailVerification = this.validationService.isEmailVerificationRequired();
      const defaultRoles = this.validationService.getDefaultRoles();
      
      return {
        success: true,
        data: {
          registrationEnabled: enabled,
          emailVerificationRequired: requiresEmailVerification,
          defaultRoles
        }
      };
    } catch (error) {
      this.logger.error('Failed to get registration status:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Post('mfa/setup')
async setupMFA(@Body() body: MFASetupInputDto, @Headers('authorization') authHeader?: string) {
  try {
    // Optionnel: vérifier l'authentification
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenValidation = await this.authService.validateToken(token);
      
      if (!tokenValidation.valid || tokenValidation.userId !== body.userId) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    const methodType = body.methodType as 'totp' | 'sms' | 'email' | 'webauthn' | 'backup_codes';

    const result = await this.authService.setupMFA({
      userId: body.userId,
      methodType: methodType, // Utiliser la variable typée
      name: body.name,
      metadata: {
        phoneNumber: body.phoneNumber,
        emailAddress: body.emailAddress,
        deviceInfo: body.deviceInfo
      }
    });

    return {
      success: true,
      data: result
    };
  } catch (error) {
    this.logger.error('MFA setup failed:', error.message);
    throw new HttpException({
      success: false,
      error: error.message
    }, HttpStatus.BAD_REQUEST);
  }
}

  @Post('mfa/verify-setup')
  async verifyMFASetup(@Body() body: { methodId: string; code: string }) {
    try {
      const result = await this.authService.verifyMFASetup(body.methodId, body.code);
      
      return {
        success: result.valid,
        data: result,
        errors: result.errors
      };
    } catch (error) {
      this.logger.error('MFA setup verification failed:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('mfa/login')
  async loginWithMFA(@Body() body: {
    username: string;
    password: string;
    deviceFingerprint?: string;
  }) {
    try {
      const result = await this.authService.loginWithMFA(
        body.username,
        body.password,
        body.deviceFingerprint
      );

      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error('MFA login failed:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('mfa/verify')
  async verifyMFA(@Body() body: MFAVerificationInputDto) {
    try {
      const result = await this.authService.completeMFALogin({
        challengeId: body.challengeId,
        code: body.code,
        deviceFingerprint: body.deviceFingerprint,
        rememberDevice: body.rememberDevice,
        metadata: body.metadata
      });

      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error('MFA verification failed:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('mfa/methods/:userId')
  async getUserMFAMethods(@Param('userId') userId: string) {
    try {
      const methods = await this.authService.getUserMFAMethods(userId);
      
      return {
        success: true,
        data: methods
      };
    } catch (error) {
      this.logger.error('Failed to get MFA methods:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('mfa/methods/:methodId')
  async removeMFAMethod(@Param('methodId') methodId: string) {
    try {
      await this.authService.removeMFAMethod(methodId);
      
      return {
        success: true,
        message: 'MFA method removed successfully'
      };
    } catch (error) {
      this.logger.error('Failed to remove MFA method:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('mfa/backup-codes/:userId')
  async generateBackupCodes(@Param('userId') userId: string) {
    try {
      const result = await this.authService.generateBackupCodes(userId);
      
      return {
        success: true,
        data: result,
        message: 'Backup codes generated. Store them securely!'
      };
    } catch (error) {
      this.logger.error('Failed to generate backup codes:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================================================================
  // ENDPOINTS DEVICE TRUST
  // ============================================================================

  @Post('device/trust')
  async trustDevice(@Body() body: DeviceTrustInputDto & { userId: string }) {
    try {
      const result = await this.authService.trustDevice(body.userId, {
        deviceFingerprint: body.deviceFingerprint,
        deviceName: body.deviceName,
        trustDurationDays: body.trustDurationDays,
        requireMFAConfirmation: body.requireMFAConfirmation
      });

      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error('Failed to trust device:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('device/trusted/:userId')
  async getTrustedDevices(@Param('userId') userId: string) {
    try {
      const devices = await this.authService.getTrustedDevices(userId);
      
      return {
        success: true,
        data: devices
      };
    } catch (error) {
      this.logger.error('Failed to get trusted devices:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('device/trusted/:deviceId')
  async revokeTrustedDevice(@Param('deviceId') deviceId: string) {
    try {
      await this.authService.revokeTrustedDevice(deviceId);
      
      return {
        success: true,
        message: 'Device trust revoked successfully'
      };
    } catch (error) {
      this.logger.error('Failed to revoke device trust:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.BAD_REQUEST);
    }
  }

  // ============================================================================
  // ENDPOINTS MAGIC LINK
  // ============================================================================

  /**
 * Générer un Magic Link
 */
@Post('magic-link/generate')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
async generateMagicLink(
  @Body() body: {
    email: string;
    action?: 'login' | 'register' | 'reset_password' | 'verify_email';
    redirectUrl?: string;
    ip?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    referrer?: string;
  },
  @Req() req?: any
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  try {
    if (!this.magicLinkService.isEnabled()) {
      return {
        success: false,
        message: 'Magic Link service is disabled'
      };
    }

    this.logger.log(`🔗 Generating magic link for: ${body.email}`);

    // Extraire le contexte depuis la requête
    const context = {
      ip: body.ip || req?.ip || req?.connection?.remoteAddress,
      userAgent: body.userAgent || req?.get('User-Agent'),
      deviceFingerprint: body.deviceFingerprint,
      referrer: body.referrer || req?.get('Referer')
    };

    const result = await this.magicLinkService.generateMagicLink({
      email: body.email,
      action: body.action || 'login',
      redirectUrl: body.redirectUrl,
      context
    });

    if (result.success) {
      return {
        success: true,
        data: {
          linkId: result.linkId,
          message: result.message,
          expiresAt: result.expiresAt,
          emailSent: result.emailSent
        }
      };
    } else {
      return {
        success: false,
        message: result.message
      };
    }

  } catch (error) {
    this.logger.error(`❌ Failed to generate magic link for ${body.email}:`, error);
    throw new HttpException(
      {
        success: false,
        message: 'Failed to generate magic link',
        error: error.message
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Vérifier un Magic Link
 */
@Post('magic-link/verify')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
async verifyMagicLink(
  @Body() body: { token: string }
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  try {
    if (!this.magicLinkService.isEnabled()) {
      return {
        success: false,
        message: 'Magic Link service is disabled'
      };
    }

    this.logger.log(`🔗 Verifying magic link token: ${body.token.substring(0, 8)}...`);

    const result = await this.magicLinkService.verifyMagicLink(body.token);

    return {
      success: result.success,
      data: {
        status: result.status,
        message: result.message,
        accessToken: result.authResponse?.access_token,
        refreshToken: result.authResponse?.refresh_token,
        tokenType: result.authResponse?.token_type,
        expiresIn: result.authResponse?.expires_in,
        requiresMFA: result.requiresMFA,
        userInfo: result.userInfo
      }
    };

  } catch (error) {
    this.logger.error(`❌ Failed to verify magic link:`, error);
    throw new HttpException(
      {
        success: false,
        message: 'Magic link verification failed',
        error: error.message
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Obtenir le statut des Magic Links pour un email
 */
@Get('magic-link/status')
async getMagicLinkStatus(
  @Query('email') email: string
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  try {
    if (!email) {
      throw new HttpException('Email parameter is required', HttpStatus.BAD_REQUEST);
    }

    if (!this.magicLinkService.isEnabled()) {
      return {
        success: false,
        message: 'Magic Link service is disabled'
      };
    }

    const links = await this.magicLinkService.getMagicLinksByEmail(email);
    
    return {
      success: true,
      data: {
        email,
        links: links.map(link => ({
          id: link.id,
          status: link.status,
          action: link.action,
          createdAt: link.createdAt,
          expiresAt: link.expiresAt,
          usedAt: link.usedAt
        })),
        count: links.length
      }
    };

  } catch (error) {
    this.logger.error(`❌ Failed to get magic link status for ${email}:`, error);
    throw new HttpException(
      {
        success: false,
        message: 'Failed to get magic link status',
        error: error.message
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Révoquer un Magic Link spécifique
 */
@Delete('magic-link/:linkId')
async revokeMagicLink(
  @Param('linkId') linkId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    if (!this.magicLinkService.isEnabled()) {
      return {
        success: false,
        message: 'Magic Link service is disabled'
      };
    }

    await this.magicLinkService.revokeMagicLink(linkId);
    
    return {
      success: true,
      message: 'Magic Link revoked successfully'
    };

  } catch (error) {
    this.logger.error(`❌ Failed to revoke magic link ${linkId}:`, error);
    throw new HttpException(
      {
        success: false,
        message: 'Failed to revoke magic link',
        error: error.message
      },
      HttpStatus.BAD_REQUEST
    );
  }
}

/**
 * Initier une authentification passwordless
 */
@Post('passwordless/initiate')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
async initiatePasswordlessAuth(
  @Body() body: {
    email: string;
    action?: 'login' | 'register';
    redirectUrl?: string;
  },
  @Req() req?: any
): Promise<{
  success: boolean;
  data?: any;
  message?: string;
}> {
  try {
    if (!this.magicLinkService.isEnabled()) {
      return {
        success: false,
        message: 'Passwordless authentication is disabled'
      };
    }

    this.logger.log(`🔗 Initiating passwordless auth for: ${body.email}`);

    const context = {
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent'),
      deviceFingerprint: req?.body?.deviceFingerprint
    };

    const result = await this.magicLinkService.initiatePasswordlessAuth({
      email: body.email,
      action: body.action || 'login',
      redirectUrl: body.redirectUrl,
      context
    });

    return {
      success: result.success,
      data: {
        method: result.method,
        linkId: result.linkId,
        message: result.message,
        expiresAt: result.expiresAt,
        maskedDestination: result.maskedDestination
      }
    };

  } catch (error) {
    this.logger.error(`❌ Failed to initiate passwordless auth for ${body.email}:`, error);
    throw new HttpException(
      {
        success: false,
        message: 'Failed to initiate passwordless authentication',
        error: error.message
      },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}

  // ============================================================================
  // ENDPOINT UNIFIÉ
  // ============================================================================

  @Post('login-with-options')
  async loginWithOptions(@Body() body: LoginWithOptionsInputDto) {
    try {
      const result = await this.authService.loginWithOptions({
        username: body.username,
        password: body.password,
        magicLinkToken: body.magicLinkToken,
        mfaCode: body.mfaCode,
        deviceFingerprint: body.deviceFingerprint,
        rememberDevice: body.rememberDevice
      });

      return {
        success: result.success,
        data: result
      };
    } catch (error) {
      this.logger.error('Login with options failed:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.UNAUTHORIZED);
    }
  }


  // ============================================================================
  // ENDPOINTS 
  // ============================================================================

  /**
   * Validation de token
   */
  @Post('validate')
  async validateToken(@Body() body: { token: string }) {
    try {
      const result = await this.authService.validateToken(body.token);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Token validation failed:', error.message);
      return {
        success: false,
        data: { valid: false },
        error: error.message
      };
    }
  }

  /**
   * Validation enrichie de token
   */
  @Post('validate-enriched')
  async validateTokenEnriched(@Body() body: { token: string }) {
    try {
      const result = await this.authService.validateTokenEnriched(body.token);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Enriched token validation failed:', error.message);
      return {
        success: false,
        data: { valid: false },
        error: error.message
      };
    }
  }

  /**
   * Informations utilisateur
   */
  @Get('user/:userId')
  async getUserInfo(@Param('userId') userId: string) {
    try {
      const userInfo = await this.authService.getUserInfo(userId);
      
      if (!userInfo) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      
      return {
        success: true,
        data: userInfo
      };
    } catch (error) {
      this.logger.error(`Failed to get user info for ${userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get user info',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Rôles utilisateur
   */
  @Get('user/:userId/roles')
  async getUserRoles(@Param('userId') userId: string) {
    try {
      const roles = await this.authService.getUserRoles(userId);
      
      return {
        success: true,
        data: { roles }
      };
    } catch (error) {
      this.logger.error(`Failed to get user roles for ${userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get user roles',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Token administrateur
   */
  @Post('admin-token')
  async getAdminToken() {
    try {
      const result = await this.authService.getClientCredentialsToken();
      
      return {
        success: true,
        data: {
          accessToken: result.access_token,
          tokenType: result.token_type,
          expiresIn: result.expires_in
        }
      };
    } catch (error) {
      this.logger.error('Failed to get admin token:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get admin token',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Validation de mot de passe
   */
  @Post('validate-password')
  async validatePassword(@Body() body: { password: string }) {
    try {
      const result = await this.validationService.validatePassword(body.password);
      
      return {
        success: true,
        data: result
      };
    } catch (error) {
      this.logger.error('Password validation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Vérification de permissions
   */
  @Post('check-permission')
  async checkPermission(
    @Headers('authorization') authHeader: string,
    @Body() body: { 
      resourceId: string; 
      resourceType: string; 
      action: string; 
      context?: Record<string, any> 
    }
  ) {
    try {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException('Token required', HttpStatus.BAD_REQUEST);
      }

      const token = authHeader.substring(7);
      const allowed = await this.authService.checkPermission(
        token, 
        body.resourceId, 
        body.resourceType, 
        body.action, 
        body.context
      );
      
      return {
        success: true,
        data: { allowed }
      };
    } catch (error) {
      this.logger.error('Permission check failed:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Permission check failed',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Événements récents avec filtrage par type
   */
  @Get('events/recent')
  async getRecentEvents(
    @Query('limit') limit?: string,
    @Query('type') type?: string
  ) {
    try {
      const events = await this.eventLogger.getRecentEvents(
        limit ? parseInt(limit) : 50
      );
      
      // Filtrer par type si spécifié
      const filteredEvents = type ? 
        events.filter(event => event.type === type) : 
        events;
      
      return {
        success: true,
        data: filteredEvents,
        count: filteredEvents.length,
        availableTypes: ['login', 'logout', 'token_validation', 'token_refresh', 'user_registered', 'email_verified', 'password_changed']
      };
    } catch (error) {
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}

  