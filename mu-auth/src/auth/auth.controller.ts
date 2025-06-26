// mu-auth/src/auth/auth.controller.ts - Version étendue avec gestion des utilisateurs
import { 
  Controller, 
  Post, 
  Get,
  Body, 
  Headers, 
  Logger, 
  HttpException, 
  HttpStatus, 
  Param, 
  Query,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { EventLoggerService } from './services/event-logger.service';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';

// DTOs existants
import { LoginInputDto } from './dto/login-input.dto';
import { RefreshTokenInputDto } from './dto/refresh-token-input.dto';

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

/**
 * Contrôleur REST pour l'authentification et la gestion des utilisateurs
 * Version étendue avec toutes les nouvelles fonctionnalités
 */
@Controller('auth')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService, 
    private readonly eventLogger: EventLoggerService,
    private readonly validationService: UserRegistrationValidationService
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

  // ============================================================================
  // ENDPOINTS EXISTANTS (inchangés)
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
   * Invalidation du cache utilisateur
   */
  @Post('invalidate-cache')
  async invalidateUserCache(@Body() body: { userId: string }) {
    try {
      await this.authService.invalidateUserCache(body.userId);
      
      return {
        success: true,
        message: 'User cache invalidated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to invalidate cache for user ${body.userId}:`, error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to invalidate user cache',
          error: error.message 
        }, 
        HttpStatus.INTERNAL_SERVER_ERROR
      );
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

  // ============================================================================
  // ENDPOINTS DE SURVEILLANCE ET DIAGNOSTIC
  // ============================================================================

  /**
   * Health check complet avec nouvelles fonctionnalités
   */
  @Get('health')
  async healthCheck() {
    try {
      const [keycloakTest, redisTest, opaTest] = await Promise.allSettled([
        this.authService.testKeycloakConnection(),
        this.authService.testRedisConnection(),
        this.authService.testOPAConnection()
      ]);

      const keycloak = keycloakTest.status === 'fulfilled' && keycloakTest.value.connected;
      const redis = redisTest.status === 'fulfilled' && redisTest.value.connected;
      const opa = opaTest.status === 'fulfilled' && opaTest.value.connected;
      
      const allHealthy = keycloak && redis && opa;

      // Informations sur les nouvelles fonctionnalités
      const features = {
        userRegistration: this.validationService.isRegistrationAllowed(),
        emailVerification: this.validationService.isEmailVerificationRequired(),
        passwordValidation: true,
        usernameValidation: true,
        emailValidation: true
      };

      return {
        success: true,
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          keycloak: {
            status: keycloak ? 'up' : 'down',
            details: keycloakTest.status === 'fulfilled' ? keycloakTest.value : undefined
          },
          redis: {
            status: redis ? 'up' : 'down',
            details: redisTest.status === 'fulfilled' ? redisTest.value : undefined
          },
          opa: {
            status: opa ? 'up' : 'down',
            details: opaTest.status === 'fulfilled' ? opaTest.value : undefined
          }
        },
        features,
        metrics: this.authService.getMetrics()
      };
    } catch (error) {
      this.logger.error('Health check failed:', error.message);
      return {
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Métriques du service avec nouvelles fonctionnalités
   */
  @Get('metrics')
  async getMetrics() {
    try {
      const metrics = this.authService.getMetrics();
      
      // Ajouter des métriques spécifiques aux nouvelles fonctionnalités
      const enhancedMetrics = {
        ...metrics,
        userManagement: {
          registrationEnabled: this.validationService.isRegistrationAllowed(),
          emailVerificationRequired: this.validationService.isEmailVerificationRequired(),
          passwordPolicyActive: true
        }
      };
      
      return {
        success: true,
        data: enhancedMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to get metrics:', error.message);
      throw new HttpException(
        { 
          success: false, 
          message: 'Failed to get metrics',
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

  /**
   * Statistiques d'enregistrement des utilisateurs
   */
  @Get('stats/registration')
  async getRegistrationStats() {
    try {
      // Ces statistiques pourraient être récupérées depuis EventLoggerService
      // Pour l'instant, retourner des données de base
      return {
        success: true,
        data: {
          registrationEnabled: this.validationService.isRegistrationAllowed(),
          totalRegistrations: 0, // À implémenter
          pendingVerifications: 0, // À implémenter
          passwordResetRequests: 0, // À implémenter
          lastRegistration: null // À implémenter
        }
      };
    } catch (error) {
      this.logger.error('Failed to get registration stats:', error.message);
      throw new HttpException({
        success: false,
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
  
  

  // ============================================================================
  // NOUVEAUX ENDPOINTS POUR LA GESTION DES UTILISATEURS
  // ============================================================================

  /**
   * Enregistrement d'un nouvel utilisateur
   */
  
  // ============================================================================
  // ENDPOINTS DE VALIDATION ET SUGGESTIONS
  // ============================================================================

  

  