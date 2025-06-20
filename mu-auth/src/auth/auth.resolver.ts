// mu-auth/src/auth/auth.resolver.ts
import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { AuthService } from './auth.service';
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

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

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
   * Obtenir l'historique d'authentification
   */
  @Query(() => [AuthenticationLogDto])
  async getAuthenticationHistory(
    @Args('userId', { nullable: true }) userId?: string,
    @Args('limit', { nullable: true, defaultValue: 100 }) limit?: number,
    @Args('offset', { nullable: true, defaultValue: 0 }) offset?: number
  ): Promise<AuthenticationLogDto[]> {
    // Cette méthode pourrait être implémentée via EventLoggerService
    // Pour l'instant, retourner un tableau vide
    return [];
  }

  /**
   * Vérifier si un utilisateur est en ligne
   */
  @Query(() => Boolean)
  async isUserOnline(@Args('userId') userId: string): Promise<boolean> {
    // Cette logique devrait vérifier les sessions actives via smp-auth-ts
    // Pour l'instant, retourner false
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

  // === MÉTHODES PRIVÉES ===

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