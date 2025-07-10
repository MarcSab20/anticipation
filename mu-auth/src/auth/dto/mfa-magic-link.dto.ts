// mu-auth/src/auth/dto/mfa-magic-link.dto.ts
/**
 * DTOs pour MFA et Magic Link - Validation et transformation des données
 */

import { Field, InputType, ObjectType, ID } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsBoolean, IsNumber, IsEnum, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { GraphQLJSONObject } from 'graphql-type-json';

// ============================================================================
// ENUMS
// ============================================================================

export enum MFAMethodType {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email',
  WEBAUTHN = 'webauthn',
  BACKUP_CODES = 'backup_codes',
  HARDWARE_TOKEN = 'hardware_token',
  PUSH = 'push',
  VOICE = 'voice',
  MAGIC_LINK = 'magic_link' 
}

export enum PasswordlessMethod {
  MAGIC_LINK = 'magic_link',
  SMS = 'sms',
  EMAIL_CODE = 'email_code'
}

export enum MagicLinkAction {
  LOGIN = 'login',
  REGISTER = 'register',
  RESET_PASSWORD = 'reset_password',
  VERIFY_EMAIL = 'verify_email'
}

// ============================================================================
// INPUT DTOS - DEVICE INFO
// ============================================================================

@InputType()
export class DeviceInfoInputDto {
  @Field(() => String, { description: "User Agent du navigateur" })
  @IsString()
  @IsNotEmpty()
  userAgent: string;

  @Field(() => String, { description: "Adresse IP" })
  @IsString()
  @IsNotEmpty()
  ip: string;

  @Field(() => String, { description: "Empreinte unique de l'appareil" })
  @IsString()
  @IsNotEmpty()
  fingerprint: string;

  @Field(() => String, { nullable: true, description: "Nom de l'appareil" })
  @IsOptional()
  @IsString()
  name?: string;

  @Field(() => String, { nullable: true, description: "Plateforme (Windows, macOS, etc.)" })
  @IsOptional()
  @IsString()
  platform?: string;
}

// ============================================================================
// INPUT DTOS - MFA SETUP
// ============================================================================

@InputType()
export class MFASetupInputDto {
  @Field(() => ID, { description: "ID de l'utilisateur" })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field(() => String, { description: "Type de méthode" }) // ⭐ CHANGÉ: String au lieu de enum
  @IsEnum(['totp', 'sms', 'email', 'webauthn', 'backup_codes'])
  methodType: string;

  @Field(() => String, { description: "Nom de la méthode" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field(() => String, { nullable: true, description: "Numéro de téléphone (pour SMS)" })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @Field(() => String, { nullable: true, description: "Adresse email (pour email MFA)" })
  @IsOptional()
  @IsEmail()
  emailAddress?: string;

  @Field(() => DeviceInfoInputDto, { nullable: true, description: "Informations de l'appareil" })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoInputDto)
  deviceInfo?: DeviceInfoInputDto;
}

// ============================================================================
// INPUT DTOS - MFA VERIFICATION
// ============================================================================

@InputType()
export class MFAVerificationInputDto {
  @Field(() => String, { description: "ID du challenge MFA" })
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @Field(() => String, { description: "Code de vérification" })
  @IsString()
  @IsNotEmpty()
  code: string;

  @Field(() => String, { nullable: true, description: "Empreinte de l'appareil" })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @Field(() => Boolean, { nullable: true, defaultValue: false, description: "Se souvenir de cet appareil" })
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Métadonnées supplémentaires" })
  @IsOptional()
  metadata?: Record<string, any>;
}

// ============================================================================
// INPUT DTOS - DEVICE TRUST
// ============================================================================

@InputType()
export class DeviceTrustInputDto {
  @Field(() => String, { description: "Empreinte unique de l'appareil" })
  @IsString()
  @IsNotEmpty()
  deviceFingerprint: string;

  @Field(() => String, { nullable: true, description: "Nom de l'appareil" })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @Field(() => Number, { nullable: true, defaultValue: 30, description: "Durée de confiance en jours" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  trustDurationDays?: number;

  @Field(() => Boolean, { nullable: true, defaultValue: false, description: "Nécessite confirmation MFA" })
  @IsOptional()
  @IsBoolean()
  requireMFAConfirmation?: boolean;
}

// ============================================================================
// INPUT DTOS - MAGIC LINK
// ============================================================================

@InputType()
export class MagicLinkContextInputDto {
  @Field(() => String, { nullable: true, description: "Adresse IP" })
  @IsOptional()
  @IsString()
  ip?: string;

  @Field(() => String, { nullable: true, description: "User Agent" })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @Field(() => String, { nullable: true, description: "Empreinte de l'appareil" })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @Field(() => String, { nullable: true, description: "URL de référence" })
  @IsOptional()
  @IsString()
  referrer?: string;

  @Field(() => String, { nullable: true, defaultValue: 'login', description: "Action à effectuer" }) // ⭐ CHANGÉ: String au lieu de enum
  @IsOptional()
  @IsEnum(['login', 'register', 'reset_password', 'verify_email'])
  action?: string;
}

@InputType()
export class MagicLinkRequestDto {
  @Field(() => String, { description: "Adresse email" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Field(() => String, { nullable: true, description: "URL de redirection après connexion" })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @Field(() => MagicLinkContextInputDto, { nullable: true, description: "Contexte de la demande" })
  @IsOptional()
  @ValidateNested()
  @Type(() => MagicLinkContextInputDto)
  context?: MagicLinkContextInputDto;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Métadonnées supplémentaires" })
  @IsOptional()
  metadata?: Record<string, any>;
}

// ============================================================================
// INPUT DTOS - PASSWORDLESS AUTH
// ============================================================================

@InputType()
export class PasswordlessContextInputDto {
  @Field(() => String, { nullable: true, description: "Adresse IP" })
  @IsOptional()
  @IsString()
  ip?: string;

  @Field(() => String, { nullable: true, description: "User Agent" })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @Field(() => String, { nullable: true, description: "Empreinte de l'appareil" })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}

@InputType()
export class PasswordlessAuthInputDto {
  @Field(() => String, { description: "Identifiant (email ou téléphone)" })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @Field(() => String, { description: "Méthode d'authentification" }) // ⭐ CHANGÉ: String au lieu de enum
  @IsEnum(['magic_link', 'sms', 'email_code'])
  method: string;

  @Field(() => String, { nullable: true, defaultValue: 'login', description: "Action à effectuer" })
  @IsOptional()
  @IsEnum(['login', 'register'])
  action?: string;

  @Field(() => String, { nullable: true, description: "URL de redirection" })
  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @Field(() => PasswordlessContextInputDto, { nullable: true, description: "Contexte de la demande" })
  @IsOptional()
  @ValidateNested()
  @Type(() => PasswordlessContextInputDto)
  context?: PasswordlessContextInputDto;
}

// ============================================================================
// OUTPUT DTOS - MFA
// ============================================================================

@ObjectType()
export class MFAMethodDto {
  @Field(() => ID, { description: "ID de la méthode" })
  id: string;

  @Field(() => ID, { description: "ID utilisateur" })
  userId: string;

  @Field(() => String, { description: "Type de méthode" }) 
  type: string;

  @Field(() => String, { description: "Nom de la méthode" })
  name: string;

  @Field(() => Boolean, { description: "Méthode activée" })
  isEnabled: boolean;

  @Field(() => Boolean, { description: "Méthode primaire" })
  isPrimary: boolean;

  @Field(() => Boolean, { description: "Méthode vérifiée" })
  isVerified: boolean;

  @Field(() => String, { description: "Date de création" })
  createdAt: string;

  @Field(() => String, { nullable: true, description: "Dernière utilisation" })
  lastUsedAt?: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Métadonnées (masquées)" })
  metadata?: Record<string, any>;
}

@ObjectType()
export class MFASetupResultDto {
  @Field(() => Boolean, { description: "Succès de la configuration" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "ID de la méthode" })
  methodId?: string;

  @Field(() => String, { nullable: true, description: "Secret TOTP (à afficher une seule fois)" })
  secret?: string;

  @Field(() => String, { nullable: true, description: "URL du QR Code" })
  qrCodeUrl?: string;

  @Field(() => [String], { nullable: true, description: "Codes de récupération" })
  backupCodes?: string[];

  @Field(() => Boolean, { nullable: true, description: "Vérification requise" })
  verificationRequired?: boolean;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;
}

@ObjectType()
export class MFAChallengeDto {
  @Field(() => ID, { description: "ID du challenge" })
  id: string;

  @Field(() => ID, { description: "ID utilisateur" })
  userId: string;

  @Field(() => String, { description: "ID de la méthode" })
  methodId: string;

  @Field(() => String, { description: "Type de méthode" }) 
  methodType: string;

  @Field(() => String, { description: "Statut du challenge" })
  status: string;

  @Field(() => String, { description: "Date de création" })
  createdAt: string;

  @Field(() => String, { description: "Date d'expiration" })
  expiresAt: string;

  @Field(() => Number, { description: "Tentatives restantes" })
  attemptsRemaining: number;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Métadonnées" })
  metadata?: Record<string, any>;
}

@ObjectType()
export class MFAVerificationResultDto {
  @Field(() => Boolean, { description: "Succès de la vérification" })
  success: boolean;

  @Field(() => String, { description: "Statut" })
  status: string;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;

  @Field(() => Number, { nullable: true, description: "Tentatives restantes" })
  attemptsRemaining?: number;

  @Field(() => String, { nullable: true, description: "Prochaine tentative à" })
  nextAttemptAt?: string;

  @Field(() => Boolean, { nullable: true, description: "Appareil de confiance" })
  deviceTrusted?: boolean;
}

// ============================================================================
// OUTPUT DTOS - DEVICE TRUST
// ============================================================================

@ObjectType()
export class TrustedDeviceDto {
  @Field(() => ID, { description: "ID de l'appareil" })
  id: string;

  @Field(() => ID, { description: "ID utilisateur" })
  userId: string;

  @Field(() => String, { description: "Empreinte de l'appareil" })
  fingerprint: string;

  @Field(() => String, { description: "Nom de l'appareil" })
  name: string;

  @Field(() => String, { nullable: true, description: "Plateforme" })
  platform?: string;

  @Field(() => String, { nullable: true, description: "Navigateur" })
  browser?: string;

  @Field(() => String, { nullable: true, description: "Adresse IP" })
  ip?: string;

  @Field(() => Boolean, { description: "Appareil actif" })
  isActive: boolean;

  @Field(() => String, { description: "Date de création" })
  createdAt: string;

  @Field(() => String, { description: "Dernière utilisation" })
  lastUsedAt: string;

  @Field(() => String, { nullable: true, description: "Date d'expiration" })
  expiresAt?: string;
}

@ObjectType()
export class DeviceTrustResultDto {
  @Field(() => Boolean, { description: "Succès de l'opération" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "ID de l'appareil" })
  deviceId?: string;

  @Field(() => Boolean, { description: "Appareil de confiance" })
  trusted: boolean;

  @Field(() => String, { nullable: true, description: "Date d'expiration" })
  expiresAt?: string;

  @Field(() => Boolean, { nullable: true, description: "MFA requis" })
  mfaRequired?: boolean;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;
}

@InputType()
export class DeviceTrustWithUserInputDto extends DeviceTrustInputDto {
  @Field(() => ID, { description: "ID de l'utilisateur" })
  @IsString()
  @IsNotEmpty()
  userId: string;
}



// ============================================================================
// OUTPUT DTOS - MAGIC LINK
// ============================================================================

@ObjectType()
export class MagicLinkResultDto {
  @Field(() => Boolean, { description: "Succès de la génération" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "ID du lien" })
  linkId?: string;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => String, { nullable: true, description: "Date d'expiration" })
  expiresAt?: string;

  @Field(() => Boolean, { nullable: true, description: "Email envoyé" })
  emailSent?: boolean;
}

@ObjectType()
export class MagicLinkDto {
  @Field(() => ID, { description: "ID du lien" })
  id: string;

  @Field(() => String, { description: "Email destinataire" })
  email: string;

  @Field(() => ID, { nullable: true, description: "ID utilisateur" })
  userId?: string;

  @Field(() => String, { description: "Statut du lien" })
  status: string;

  @Field(() => String, { description: "Action du lien" }) // ⭐ CHANGÉ: String au lieu de MagicLinkAction
  action: string;

  @Field(() => String, { description: "Date de création" })
  createdAt: string;

  @Field(() => String, { description: "Date d'expiration" })
  expiresAt: string;

  @Field(() => String, { nullable: true, description: "Date d'utilisation" })
  usedAt?: string;

  @Field(() => String, { nullable: true, description: "URL de redirection" })
  redirectUrl?: string;
}

@ObjectType()
export class MagicLinkVerificationResultDto {
  @Field(() => Boolean, { description: "Succès de la vérification" })
  success: boolean;

  @Field(() => String, { description: "Statut du lien" })
  status: string;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;

  @Field(() => String, { nullable: true, description: "Token d'accès" })
  accessToken?: string;

  @Field(() => String, { nullable: true, description: "Token de rafraîchissement" })
  refreshToken?: string;

  @Field(() => String, { nullable: true, description: "Type de token" })
  tokenType?: string;

  @Field(() => Number, { nullable: true, description: "Durée de validité" })
  expiresIn?: number;

  @Field(() => Boolean, { nullable: true, description: "MFA requis" })
  requiresMFA?: boolean;

  @Field(() => MFAChallengeDto, { nullable: true, description: "Challenge MFA" })
  mfaChallenge?: MFAChallengeDto;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Informations utilisateur" })
  userInfo?: Record<string, any>;
}

// ============================================================================
// OUTPUT DTOS - PASSWORDLESS
// ============================================================================

@ObjectType()
export class PasswordlessAuthResultDto {
  @Field(() => Boolean, { description: "Succès de l'initiation" })
  success: boolean;

  @Field(() => String, { description: "Méthode utilisée" }) 
  method: string;

  @Field(() => String, { nullable: true, description: "ID du challenge" })
  challengeId?: string;

  @Field(() => String, { nullable: true, description: "ID du lien magique" })
  linkId?: string;

  @Field(() => String, { description: "Message de statut" })
  message: string;

  @Field(() => String, { nullable: true, description: "Date d'expiration" })
  expiresAt?: string;

  @Field(() => String, { nullable: true, description: "Destination masquée" })
  maskedDestination?: string;
}

// ============================================================================
// OUTPUT DTOS - BACKUP CODES
// ============================================================================

@ObjectType()
export class BackupCodesGenerationDto {
  @Field(() => ID, { description: "ID utilisateur" })
  userId: string;

  @Field(() => [String], { description: "Codes de récupération" })
  codes: string[];

  @Field(() => String, { description: "Date de génération" })
  generatedAt: string;

  @Field(() => Number, { description: "Codes restants" })
  remainingCodes: number;

  @Field(() => String, { nullable: true, description: "Message important" })
  message?: string;
}

@ObjectType()
export class RecoveryOptionsDto {
  @Field(() => Boolean, { description: "Possède des codes de récupération" })
  hasBackupCodes: boolean;

  @Field(() => Number, { description: "Codes de récupération restants" })
  backupCodesRemaining: number;

  @Field(() => Boolean, { description: "Email de récupération configuré" })
  hasRecoveryEmail: boolean;

  @Field(() => Boolean, { description: "Téléphone de récupération configuré" })
  hasRecoveryPhone: boolean;

  @Field(() => [String], { description: "Méthodes de récupération disponibles" }) 
  recoveryMethods: string[];
}

// ============================================================================
// OUTPUT DTOS - AUTHENTICATION FLOW
// ============================================================================

@ObjectType()
export class AuthenticationFlowDto {
  @Field(() => ID, { description: "ID du flow" })
  flowId: string;

  @Field(() => ID, { nullable: true, description: "ID utilisateur" })
  userId?: string;

  @Field(() => String, { nullable: true, description: "Email" })
  email?: string;

  @Field(() => String, { description: "Étape actuelle" })
  step: string;

  @Field(() => String, { description: "Méthode d'authentification" })
  method: string;

  @Field(() => Boolean, { description: "MFA requis" })
  mfaRequired: boolean;

  @Field(() => Boolean, { description: "MFA complété" })
  mfaCompleted: boolean;

  @Field(() => Boolean, { description: "Appareil de confiance" })
  deviceTrusted: boolean;

  @Field(() => String, { description: "Date de création" })
  createdAt: string;

  @Field(() => String, { description: "Date d'expiration" })
  expiresAt: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Métadonnées" })
  metadata?: Record<string, any>;
}

// ============================================================================
// OUTPUT DTOS - LOGIN WITH MFA
// ============================================================================

@ObjectType()
export class LoginWithMFAResultDto {
  @Field(() => Boolean, { description: "Succès de la connexion" })
  success: boolean;

  @Field(() => String, { nullable: true, description: "Token d'accès" })
  accessToken?: string;

  @Field(() => String, { nullable: true, description: "Token de rafraîchissement" })
  refreshToken?: string;

  @Field(() => String, { nullable: true, description: "Type de token" })
  tokenType?: string;

  @Field(() => Number, { nullable: true, description: "Durée de validité" })
  expiresIn?: number;

  @Field(() => String, { nullable: true, description: "Scope" })
  scope?: string;

  @Field(() => String, { nullable: true, description: "ID de session" })
  sessionId?: string;

  @Field(() => Boolean, { nullable: true, description: "MFA requis" })
  requiresMFA?: boolean;

  @Field(() => MFAChallengeDto, { nullable: true, description: "Challenge MFA" })
  mfaChallenge?: MFAChallengeDto;

  @Field(() => Boolean, { nullable: true, description: "Appareil de confiance" })
  trustedDevice?: boolean;

  @Field(() => String, { nullable: true, description: "Message" })
  message?: string;
}

// ============================================================================
// OUTPUT DTOS - SECURITY SUMMARY
// ============================================================================

@ObjectType()
export class SecuritySummaryDto {
  @Field(() => String, { description: "Statut MFA" })
  mfaStatus: string;

  @Field(() => [MFAMethodDto], { description: "Méthodes MFA" })
  mfaMethods: MFAMethodDto[];

  @Field(() => [TrustedDeviceDto], { description: "Appareils de confiance" })
  trustedDevices: TrustedDeviceDto[];

  @Field(() => RecoveryOptionsDto, { description: "Options de récupération" })
  recoveryOptions: RecoveryOptionsDto;

  @Field(() => GraphQLJSONObject, { description: "Activité récente" })
  recentActivity: Record<string, any>;

  @Field(() => String, { description: "Dernière mise à jour" })
  lastUpdated: string;
}

// ============================================================================
// OUTPUT DTOS - AUDIT
// ============================================================================

@ObjectType()
export class MFAAuditLogDto {
  @Field(() => ID, { description: "ID du log" })
  id: string;

  @Field(() => ID, { description: "ID utilisateur" })
  userId: string;

  @Field(() => String, { nullable: true, description: "ID de session" })
  sessionId?: string;

  @Field(() => String, { description: "Action effectuée" })
  action: string;

  @Field(() => String, { nullable: true, description: "Type de méthode" }) // ⭐ CHANGÉ: String au lieu de MFAMethodType
  methodType?: string;

  @Field(() => String, { nullable: true, description: "ID de méthode" })
  methodId?: string;

  @Field(() => Boolean, { description: "Succès de l'action" })
  success: boolean;

  @Field(() => String, { description: "Timestamp" })
  timestamp: string;

  @Field(() => String, { nullable: true, description: "Adresse IP" })
  ip?: string;

  @Field(() => String, { nullable: true, description: "User Agent" })
  userAgent?: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: "Détails" })
  details?: Record<string, any>;

  @Field(() => String, { nullable: true, description: "ID de corrélation" })
  correlationId?: string;
}

@ObjectType()
export class AuthenticationHistoryDto {
  @Field(() => [GraphQLJSONObject], { description: "Logs d'authentification" })
  authLogs: Record<string, any>[];

  @Field(() => [MFAAuditLogDto], { description: "Logs MFA" })
  mfaLogs: MFAAuditLogDto[];

  @Field(() => [MagicLinkDto], { description: "Logs Magic Link" })
  magicLinkLogs: MagicLinkDto[];

  @Field(() => Number, { description: "Nombre total" })
  totalCount: number;

  @Field(() => String, { description: "Dernière mise à jour" })
  lastUpdated: string;
}

// ============================================================================
// INPUT DTOS - COMBINED LOGIN
// ============================================================================

@InputType()
export class LoginWithOptionsInputDto {
  @Field(() => String, { nullable: true, description: "Nom d'utilisateur" })
  @IsOptional()
  @IsString()
  username?: string;

  @Field(() => String, { nullable: true, description: "Mot de passe" })
  @IsOptional()
  @IsString()
  password?: string;

  @Field(() => String, { nullable: true, description: "Token Magic Link" })
  @IsOptional()
  @IsString()
  magicLinkToken?: string;

  @Field(() => String, { nullable: true, description: "Code MFA" })
  @IsOptional()
  @IsString()
  mfaCode?: string;

  @Field(() => String, { nullable: true, description: "Empreinte de l'appareil" })
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @Field(() => Boolean, { nullable: true, defaultValue: false, description: "Se souvenir de l'appareil" })
  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean;
}

// ============================================================================
// OUTPUT DTOS - CONFIGURATION
// ============================================================================

@ObjectType()
export class ExtendedConfigDto {
  @Field(() => GraphQLJSONObject, { description: "Configuration de base" })
  baseConfig: Record<string, any>;

  @Field(() => Boolean, { description: "MFA activé" })
  mfaEnabled: boolean;

  @Field(() => Boolean, { description: "Magic Link activé" })
  magicLinkEnabled: boolean;

  @Field(() => Boolean, { description: "Device Trust activé" })
  deviceTrustEnabled: boolean;

  @Field(() => Boolean, { description: "Passwordless activé" })
  passwordlessEnabled: boolean;

  @Field(() => [String], { description: "Méthodes MFA autorisées" }) 
  allowedMFAMethods: string[];

  @Field(() => Number, { description: "Durée d'expiration des Magic Links (minutes)" })
  magicLinkExpiryMinutes: number;

  @Field(() => Number, { description: "Durée de confiance des appareils (jours)" })
  deviceTrustDays: number;
}

@ObjectType()
export class ExtendedHealthCheckDto {
  @Field(() => String, { description: "Statut global" })
  status: string;

  @Field(() => String, { description: "Timestamp" })
  timestamp: string;

  @Field(() => GraphQLJSONObject, { description: "Services" })
  services: Record<string, any>;

  @Field(() => GraphQLJSONObject, { description: "Fonctionnalités" })
  features: Record<string, any>;

  @Field(() => GraphQLJSONObject, { description: "Métriques" })
  metrics: Record<string, any>;

  @Field(() => String, { nullable: true, description: "Message d'erreur" })
  error?: string;
}

// ============================================================================
// VALIDATORS PERSONNALISÉS
// ============================================================================

export class MFAValidators {
  static isValidTOTPCode(code: string): boolean {
    return /^\d{6}$/.test(code);
  }

  static isValidSMSCode(code: string): boolean {
    return /^\d{4,8}$/.test(code);
  }

  static isValidPhoneNumber(phone: string): boolean {
    return /^\+?[1-9]\d{1,14}$/.test(phone);
  }

  static isValidDeviceFingerprint(fingerprint: string): boolean {
    return fingerprint.length >= 32 && fingerprint.length <= 128;
  }

  static isValidMagicLinkToken(token: string): boolean {
    return /^[a-f0-9]{32,64}$/.test(token);
  }
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

export class MFATransformers {
  static maskPhoneNumber(phone: string): string {
    if (phone.length <= 4) return phone;
    return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
  }

  static maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    if (username.length <= 2) return email;
    return username.slice(0, 2) + '*'.repeat(username.length - 2) + '@' + domain;
  }

  static formatMFAMethod(method: any): MFAMethodDto {
    return {
      id: method.id,
      userId: method.userId,
      type: method.type,
      name: method.name,
      isEnabled: method.isEnabled,
      isPrimary: method.isPrimary,
      isVerified: method.isVerified,
      createdAt: method.createdAt,
      lastUsedAt: method.lastUsedAt,
      metadata: method.metadata ? {
        ...method.metadata,
        // Masquer les données sensibles
        secret: undefined,
        phoneNumber: method.metadata.phoneNumber ? 
          MFATransformers.maskPhoneNumber(method.metadata.phoneNumber) : undefined,
        emailAddress: method.metadata.emailAddress ? 
          MFATransformers.maskEmail(method.metadata.emailAddress) : undefined
      } : undefined
    };
  }

  static formatTrustedDevice(device: any): TrustedDeviceDto {
    return {
      id: device.id,
      userId: device.userId,
      fingerprint: device.fingerprint.substring(0, 8) + '...', // Masquer l'empreinte complète
      name: device.name,
      platform: device.platform,
      browser: device.browser,
      ip: device.ip,
      isActive: device.isActive,
      createdAt: device.createdAt,
      lastUsedAt: device.lastUsedAt,
      expiresAt: device.expiresAt
    };
  }
}

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