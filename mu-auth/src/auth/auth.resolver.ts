// mu-auth/src/auth/auth.resolver.ts - Version étendue avec gestion des utilisateurs
import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthService } from './auth.service';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginInputDto } from './dto/login-input.dto';
import { RefreshTokenInputDto } from './dto/refresh-token-input.dto';
import { 
  TokenValidationDto, 
  EnrichedTokenValidationDto, 
  UserInfoDto, 
  ConnectionTestDto,
  AuthenticationLogDto 
} from './dto/token-validation.dto';

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
  ResendVerificationInputDto,
  PasswordValidationResult,
  UsernameValidationResult,
  EmailValidationResult
} from './dto/user-registration.dto';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly validationService: UserRegistrationValidationService
  ) {}

  // ============================================================================
  // MUTATIONS D'AUTHENTIFICATION EXISTANTES
  // ============================================================================

  /**
   * Authentification utilisateur
   */
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

  // ============================================================================
  // NOUVELLES MUTATIONS POUR LA GESTION DES UTILISATEURS
  // ============================================================================

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

  // ============================================================================
  // QUERIES D'AUTHENTIFICATION EXISTANTES
  // ============================================================================

  /**
   * Validation de token basique
   */
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

  // ============================================================================
  // NOUVELLES QUERIES POUR LA VALIDATION ET LES SUGGESTIONS
  // ============================================================================

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

  // ============================================================================
  // QUERIES DE TEST DE CONNECTIVITÉ
  // ============================================================================

  /**
   * Tester la connexion Redis
   */
  @Query(() => ConnectionTestDto)
  async testRedisConnection(): Promise<ConnectionTestDto> {
    return await this.authService.testRedisConnection();
  }

  /**
   * Tester la connexion Keycloak
   */
  @Query(() => ConnectionTestDto)
  async testKeycloakConnection(): Promise<ConnectionTestDto> {
    return await this.authService.testKeycloakConnection();
  }

  /**
   * Tester la connexion OPA
   */
  @Query(() => ConnectionTestDto)
  async testOPAConnection(): Promise<ConnectionTestDto> {
    return await this.authService.testOPAConnection();
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
   * Obtenir les statistiques d'authentification
   */
  @Query(() => ConnectionTestDto)
  async getAuthenticationStats(): Promise<ConnectionTestDto> {
    const metrics = this.authService.getMetrics();
    
    return {
      connected: true,
      info: 'Authentication service operational',
      details: metrics,
      timestamp: new Date().toISOString()
    };
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

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

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
}

// ============================================================================
// DTOS SUPPLÉMENTAIRES POUR LES NOUVELLES QUERIES
// ============================================================================

import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class PasswordValidationDto {
  @Field(() => Boolean)
  valid: boolean;

  @Field(() => Number)
  score: number;

  @Field(() => [String])
  errors: string[];

  @Field(() => [String])
  suggestions: string[];
}

@ObjectType()
export class UsernameValidationDto {
  @Field(() => Boolean)
  valid: boolean;

  @Field(() => Boolean)
  available: boolean;

  @Field(() => [String])
  errors: string[];

  @Field(() => [String])
  suggestions: string[];
}

@ObjectType()
export class EmailValidationDto {
  @Field(() => Boolean)
  valid: boolean;

  @Field(() => Boolean)
  available: boolean;

  @Field(() => Boolean)
  deliverable: boolean;

  @Field(() => [String])
  errors: string[];
}

@ObjectType()
export class PasswordPolicyDto {
  @Field(() => Number)
  minLength: number;

  @Field(() => Boolean)
  requireUppercase: boolean;

  @Field(() => Boolean)
  requireLowercase: boolean;

  @Field(() => Boolean)
  requireNumbers: boolean;

  @Field(() => Boolean)
  requireSpecialChars: boolean;

  @Field(() => [String])
  forbiddenPatterns: string[];
}