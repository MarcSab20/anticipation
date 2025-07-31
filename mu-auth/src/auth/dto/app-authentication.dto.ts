import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { Field, ObjectType, InputType } from '@nestjs/graphql';

@InputType()
export class AppLoginInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  appID: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  appKey: string;
}

@ObjectType()
export class ApplicationDetails {
  @Field(() => String)
  applicationID: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  plan?: string;

  @Field(() => Boolean, { nullable: true })
  isOfficialApp?: boolean;
}


@ObjectType()
export class AppLoginResponse {
  @Field(() => String, { nullable: true })
  accessToken: string;

  @Field(() => String, { nullable: true })
  refreshToken?: string | null;

  @Field(() => Number, { nullable: true })
  accessValidityDuration?: number | null;

  @Field(() => Number,{ nullable: true })
  refreshValidityDuration?: number | null;

  @Field(() => ApplicationDetails, { nullable: true })
  application?: ApplicationDetails | null;

  @Field(() => String,{ nullable: true })
  message?: string;

  @Field(() => [String], { nullable: true })
  errors?: string[];
}

@ObjectType()
export class ApplicationTokenValidationResult {
  @Field(() => Boolean)
  valid: boolean;

  @Field(() => String, { nullable: true })
  appID?: string | null;

  @Field(() => String, { nullable: true })
  clientId?: string | null;

  @Field(() => [String], { nullable: true })
  scopes?: string[] | null;

  @Field(() => String, { nullable: true })
  expiresAt?: string | null;
}

@ObjectType()
export class ApplicationLogoutResponse {
  @Field()
  success: boolean;

  @Field()
  message: string;
}

@InputType()
export class RefreshApplicationTokenInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  appID: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

@InputType()
export class ValidateApplicationTokenInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

@InputType()
export class LogoutApplicationInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  appID: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}

export interface ApplicationAuthEvent {
  type: 'app_authenticated' | 'app_authentication_failed' | 'app_logged_out' | 'app_token_refreshed';
  appID: string;
  success: boolean;
  timestamp: string;
  duration?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface AppAuthRestResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface ApplicationToken {
  appID: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
  correlationId?: string;
}