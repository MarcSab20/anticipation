import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsBoolean, MinLength, Matches } from 'class-validator';
import { GraphQLJSONObject } from 'graphql-type-json';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  score: number; // 0-100
  suggestions: string[];
}

export interface UsernameValidationResult {
  valid: boolean;
  available: boolean;
  errors: string[];
  suggestions: string[];
}

export interface EmailValidationResult {
  valid: boolean;
  available: boolean;
  deliverable: boolean;
  errors: string[];
}

// ============================================================================
// INPUT DTOS
// ============================================================================

@InputType()
export class UserRegistrationInputDto {
  @Field(() => String, { description: "Nom d'utilisateur unique" })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'Username can only contain letters, numbers, underscores and hyphens' })
  username: string;

  @Field(() => String, { description: "Adresse email" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Field(() => String, { description: "Mot de passe" })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'
  })
  password: string;

  @Field(() => String, { nullable: true, description: "Prénom" })
  @IsOptional()
  @IsString()
  firstName?: string;

  @Field(() => String, { nullable: true, description: "Nom de famille" })
  @IsOptional()
  @IsString()
  lastName?: string;

  @Field(() => Boolean, { nullable: true, defaultValue: true, description: "Compte activé" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Field(() => Boolean, { nullable: true, defaultValue: false, description: "Email vérifié" })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Attributs personnalisés" })
  @IsOptional()
  attributes?: Record<string, string[]>;
}

@InputType()
export class VerifyEmailInputDto {
  @Field(() => String, { description: "ID de l'utilisateur" })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field(() => String, { description: "Token de vérification" })
  @IsString()
  @IsNotEmpty()
  token: string;
}

@InputType()
export class ResetPasswordInputDto {
  @Field(() => String, { description: "Adresse email" })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

@InputType()
export class ChangePasswordInputDto {
  @Field(() => String, { description: "ID de l'utilisateur" })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field(() => String, { description: "Ancien mot de passe" })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @Field(() => String, { description: "Nouveau mot de passe" })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'
  })
  newPassword: string;
}

@InputType()
export class ResendVerificationInputDto {
  @Field(() => String, { description: "ID de l'utilisateur" })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

@ObjectType()
export class UserRegistrationResponseDto {
  @Field(() => Boolean, { description: "Succès de l'enregistrement" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "ID de l'utilisateur créé" })
  userId?: string;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => [String], { nullable: true, description: "Liste des erreurs" })
  errors?: string[];

  @Field(() => String, { nullable: true, description: "Token de vérification d'email" })
  verificationToken?: string;

  @Field(() => Boolean, { nullable: true, description: "Email de vérification envoyé" })
  verificationEmailSent?: boolean;
}

@ObjectType()
export class EmailVerificationResponseDto {
  @Field(() => Boolean, { description: "Succès de la vérification" })
  success: boolean;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => String, { nullable: true, description: "Code d'erreur" })
  errorCode?: string;
}

@ObjectType()
export class PasswordResetResponseDto {
  @Field(() => Boolean, { description: "Email de reset envoyé" })
  success: boolean;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => String, { nullable: true, description: "ID de la demande" })
  requestId?: string;
}

@ObjectType()
export class PasswordChangeResponseDto {
  @Field(() => Boolean, { description: "Succès du changement" })
  success: boolean;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => Boolean, { nullable: true, description: "Nécessite une reconnexion" })
  requiresReauth?: boolean;
}

export type UserManagementEventType = 
  | 'user_registered'
  | 'email_verified'
  | 'email_verification_sent'
  | 'password_reset_requested'
  | 'password_changed'
  | 'account_activated'
  | 'account_deactivated';

export interface UserManagementEvent {
  id: string;
  type: UserManagementEventType;
  userId?: string;
  username?: string;
  email?: string;
  success: boolean;
  timestamp: string;
  duration?: number;
  error?: string;
  details?: {
    registrationMethod?: string;
    emailVerificationRequired?: boolean;
    passwordComplexityMet?: boolean;
    defaultRolesAssigned?: string[];
    verificationEmailSent?: boolean;
    correlationId?: string;
    ip?: string;
    userAgent?: string;
  };
}

export interface UserRegistrationConfig {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    forbiddenPatterns: string[];
  };
  emailPolicy: {
    requireVerification: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  usernamePolicy: {
    minLength: number;
    maxLength: number;
    allowedChars: RegExp;
    reservedUsernames: string[];
  };
  registrationFlow: {
    requireEmailVerification: boolean;
    autoActivateAccount: boolean;
    sendWelcomeEmail: boolean;
    assignDefaultRoles: boolean;
    defaultRoles: string[];
  };
}



export interface UserRegistrationConfig {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    forbiddenPatterns: string[];
  };
  emailPolicy: {
    requireVerification: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  usernamePolicy: {
    minLength: number;
    maxLength: number;
    allowedChars: RegExp;
    reservedUsernames: string[];
  };
  registrationFlow: {
    requireEmailVerification: boolean;
    autoActivateAccount: boolean;
    sendWelcomeEmail: boolean;
    assignDefaultRoles: boolean;
    defaultRoles: string[];
  };
}
