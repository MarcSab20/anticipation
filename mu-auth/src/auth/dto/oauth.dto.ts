// mu-auth/src/auth/dto/oauth.dto.ts
import { Field, ObjectType, InputType } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsEmail, IsIn } from 'class-validator';
import { GraphQLJSONObject } from 'graphql-type-json';

// =============================================================================
// INPUT TYPES (pour les mutations et queries)
// =============================================================================

@InputType()
export class OAuthAuthorizationInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  originalUrl?: string;
}

@InputType()
export class OAuthCallbackInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  code: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  state: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  error?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  errorDescription?: string;
}

@InputType()
export class OAuthLinkAccountInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  providerUserId: string;
}

@InputType()
export class OAuthUnlinkAccountInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;
}

@InputType()
export class OAuthRefreshTokenInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;
}

// =============================================================================
// OUTPUT TYPES (pour les responses)
// =============================================================================

@ObjectType()
export class OAuthUserInfo {
  @Field()
  id: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  username?: string;

  @Field(() => Boolean, { nullable: true })
  verified?: boolean;

  @Field()
  provider: string;

  @Field({ nullable: true })
  locale?: string;
}

@ObjectType()
export class OAuthTokenInfo {
  @Field()
  accessToken: string;

  @Field()
  tokenType: string;

  @Field()
  expiresIn: number;

  @Field({ nullable: true })
  refreshToken?: string;

  @Field({ nullable: true })
  scope?: string;

  @Field({ nullable: true })
  idToken?: string;
}

@ObjectType()
export class OAuthAuthorizationResponse {
  @Field(() => Boolean)
  success: boolean;

  @Field()
  authUrl: string;

  @Field()
  state: string;

  @Field()
  provider: string;

  @Field({ nullable: true })
  expiresAt?: string;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class OAuthCallbackResponse {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => OAuthUserInfo, { nullable: true })
  userInfo?: OAuthUserInfo;

  @Field(() => OAuthTokenInfo, { nullable: true })
  tokens?: OAuthTokenInfo;

  @Field({ nullable: true })
  message?: string;

  @Field({ nullable: true })
  error?: string;
}

@ObjectType()
export class LinkedAccountInfo {
  @Field()
  userId: string;

  @Field()
  provider: string;

  @Field()
  providerUserId: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  username?: string;

  @Field()
  linkedAt: string;

  @Field({ nullable: true })
  lastSync?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  metadata?: Record<string, any>;
}

@ObjectType()
export class OAuthProviderInfo {
  @Field()
  name: string;

  @Field()
  displayName: string;

  @Field(() => Boolean)
  enabled: boolean;

  @Field(() => [String])
  scopes: string[];

  @Field()
  authUrl: string;

  @Field(() => Boolean)
  supportsRefresh: boolean;

  @Field({ nullable: true })
  iconUrl?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Boolean, { nullable: true })
  configured?: boolean;
}

// =============================================================================
// TYPES POUR LES ÉVÉNEMENTS ET STATISTIQUES
// =============================================================================

@ObjectType()
export class OAuthEventInfo {
  @Field()
  id: string;

  @Field()
  type: string;

  @Field()
  provider: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  email?: string;

  @Field(() => Boolean)
  success: boolean;

  @Field()
  timestamp: string;

  @Field({ nullable: true })
  duration?: number;

  @Field({ nullable: true })
  error?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  metadata?: Record<string, any>;
}

@ObjectType()
export class OAuthStatistics {
  @Field()
  totalAttempts: number;

  @Field()
  successfulAttempts: number;

  @Field()
  failedAttempts: number;

  @Field()
  successRate: number;

  @Field(() => [OAuthProviderStats])
  providerStats: OAuthProviderStats[];

  @Field()
  lastUpdated: string;
}

@ObjectType()
export class OAuthProviderStats {
  @Field()
  provider: string;

  @Field()
  attempts: number;

  @Field()
  successes: number;

  @Field()
  failures: number;

  @Field()
  averageResponseTime: number;

  @Field()
  lastUsed: string;
}

// =============================================================================
// TYPES POUR LA CONFIGURATION
// =============================================================================

@InputType()
export class OAuthConfigInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'github'])
  provider: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  redirectUri: string;

  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  scopes: string[];

  @Field(() => Boolean)
  @IsBoolean()
  enabled: boolean;
}

@ObjectType()
export class OAuthConfigResponse {
  @Field(() => Boolean)
  success: boolean;

  @Field({ nullable: true })
  message?: string;

  @Field(() => [String], { nullable: true })
  errors?: string[];
}

// =============================================================================
// TYPES POUR LE TEST ET DEBUGGING
// =============================================================================

@ObjectType()
export class OAuthTestResult {
  @Field()
  provider: string;

  @Field(() => Boolean)
  configurationValid: boolean;

  @Field(() => Boolean)
  authUrlGenerated: boolean;

  @Field({ nullable: true })
  testAuthUrl?: string;

  @Field(() => [String])
  steps: string[];

  @Field(() => [String], { nullable: true })
  errors?: string[];

  @Field()
  timestamp: string;
}

@ObjectType()
export class OAuthHealthCheck {
  @Field(() => Boolean)
  healthy: boolean;

  @Field()
  activeProviders: number;

  @Field(() => [String])
  availableProviders: string[];

  @Field(() => [String], { nullable: true })
  issues?: string[];

  @Field()
  lastChecked: string;
}

// =============================================================================
// ENUMS
// =============================================================================

export enum OAuthProvider {
  GOOGLE = 'google',
  GITHUB = 'github'
}

export enum OAuthEventType {
  AUTHORIZATION_STARTED = 'oauth_authorization_started',
  AUTHORIZATION_COMPLETED = 'oauth_authorization_completed',
  AUTHORIZATION_FAILED = 'oauth_authorization_failed',
  USER_INFO_RETRIEVED = 'oauth_user_info_retrieved',
  ACCOUNT_LINKED = 'oauth_account_linked',
  ACCOUNT_UNLINKED = 'oauth_account_unlinked',
  TOKEN_REFRESHED = 'oauth_token_refreshed'
}