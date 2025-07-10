// smp-auth-ts/src/interface/mfa.interface.ts
import type { UserId, SessionId, CorrelationId, ValidationResult } from './common.js';
import type { AuthResponse, UserInfo } from './auth.interface.js';

export type MFAMethodType = 
  | 'totp'         
  | 'sms'          
  | 'email'        
  | 'webauthn'      
  | 'backup_codes' 
  | 'hardware_token' 
  | 'push'         
  | 'voice'         
  | 'magic_link';   

export type MFAStatus = 'disabled' | 'enabled' | 'enforced' | 'setup_required';
export type MFAVerificationStatus = 'pending' | 'verified' | 'failed' | 'expired' | 'rate_limited';
export type MagicLinkStatus = 'pending' | 'used' | 'expired' | 'revoked';

export interface MFAConfig {
  enabled: boolean;
  enforcedForRoles?: string[];
  gracePeriodDays?: number;
  maxAttempts?: number;
  codeLength?: number;
  codeExpiry?: number;
  rateLimit?: {
    maxAttempts: number;
    windowMinutes: number;
    lockoutMinutes: number;
  };
  allowedMethods: MFAMethodType[];
  requireBackupCodes?: boolean;
  rememberDeviceDays?: number;
}

export interface MFAMethod {
  id: string;
  userId: UserId;
  type: MFAMethodType;
  name: string;
  isEnabled: boolean;
  isPrimary: boolean;
  isVerified: boolean;
  createdAt: string;
  lastUsedAt?: string;
  metadata: MFAMethodMetadata;
}

export interface MFAMethodMetadata {
  secret?: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
  
  phoneNumber?: string;
  phoneCountryCode?: string;
  
  emailAddress?: string;
  
  deviceFingerprint?: string;
  deviceName?: string;

  vendor?: string;
  lastBackupCodesGenerated?: string;
  failedAttempts?: number;
  lastFailedAttempt?: string;
}

export interface MFAChallenge {
  id: string;
  userId: UserId;
  sessionId?: SessionId;
  methodId: string;
  methodType: MFAMethodType;
  status: MFAVerificationStatus;
  code?: string;
  createdAt: string;
  expiresAt: string;
  attemptsRemaining: number;
  metadata?: {
    maskedPhone?: string;
    maskedEmail?: string;
    qrCodeUrl?: string;
    pushSent?: boolean;
    correlationId?: CorrelationId;
  };
}

export interface MFAVerificationRequest {
  challengeId: string;
  code: string;
  deviceFingerprint?: string;
  rememberDevice?: boolean;
  metadata?: Record<string, any>;
}

export interface MFAVerificationResult {
  success: boolean;
  status: MFAVerificationStatus;
  message?: string;
  attemptsRemaining?: number;
  nextAttemptAt?: string;
  authResponse?: AuthResponse;
  deviceTrusted?: boolean;
}

export interface MFASetupRequest {
  userId: UserId;
  methodType: MFAMethodType;
  name: string;
  metadata?: {
    phoneNumber?: string;
    emailAddress?: string;
    deviceInfo?: DeviceInfo;
  };
}

export interface MFASetupResult {
  success: boolean;
  methodId?: string;
  secret?: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
  verificationRequired?: boolean;
  challenge?: MFAChallenge;
}

export interface DeviceInfo {
  userAgent: string;
  ip: string;
  fingerprint: string;
  name?: string;
  platform?: string;
  trusted?: boolean;
  phoneCountryCode?: string;
}

export interface MagicLinkConfig {
  enabled: boolean;
  tokenLength?: number;
  expiryMinutes?: number;
  maxUsesPerDay?: number;
  requireExistingUser?: boolean;
  autoCreateUser?: boolean;
  redirectUrl?: string;
  emailTemplate?: string;
}

export interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
  context?: {
    ip?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    referrer?: string;
    action?: 'login' | 'register' | 'reset_password' | 'verify_email';
  };
  metadata?: Record<string, any>;
}

export interface MagicLink {
  id: string;
  token: string;
  email: string;
  userId?: UserId;
  status: MagicLinkStatus;
  action: 'login' | 'register' | 'reset_password' | 'verify_email';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  redirectUrl?: string;
  metadata?: {
    ip?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    correlationId?: CorrelationId;
  };
}

export interface MagicLinkResult {
  success: boolean;
  linkId?: string;
  message: string;
  expiresAt?: string;
  emailSent?: boolean;
}

export interface MagicLinkVerificationResult {
  success: boolean;
  status: MagicLinkStatus;
  message?: string;
  authResponse?: AuthResponse;
  userInfo?: UserInfo;
  requiresMFA?: boolean;
  mfaChallenge?: MFAChallenge;
}

export interface PasswordlessAuthRequest {
  identifier: string; 
  method: 'magic_link' | 'sms' | 'email_code';
  action?: 'login' | 'register';
  redirectUrl?: string;
  context?: {
    ip?: string;
    userAgent?: string;
    deviceFingerprint?: string;
  };
}

export interface PasswordlessAuthResult {
  success: boolean;
  method: 'magic_link' | 'sms' | 'email_code';
  challengeId?: string;
  linkId?: string;
  message: string;
  expiresAt?: string;
  maskedDestination?: string;
}

export interface TrustedDevice {
  id: string;
  userId: UserId;
  fingerprint: string;
  name: string;
  platform?: string;
  browser?: string;
  ip?: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;
  metadata?: {
    userAgent: string;
    location?: string;
    mfaBypassEnabled: boolean;
  };
}

export interface DeviceTrustRequest {
  deviceFingerprint: string;
  deviceName?: string;
  trustDurationDays?: number;
  requireMFAConfirmation?: boolean;
}

export interface DeviceTrustResult {
  success: boolean;
  deviceId?: string;
  trusted: boolean;
  expiresAt?: string;
  mfaRequired?: boolean;
}

export interface BackupCodesGeneration {
  userId: UserId;
  codes: string[];
  generatedAt: string;
  usedCodes: string[];
  remainingCodes: number;
}

export interface RecoveryOptions {
  hasBackupCodes: boolean;
  backupCodesRemaining: number;
  hasRecoveryEmail: boolean;
  hasRecoveryPhone: boolean;
  recoveryMethods: MFAMethodType[];
}

export interface MFAService {
  getMFAConfig(userId: UserId): Promise<MFAConfig>;
  updateMFAConfig(userId: UserId, config: Partial<MFAConfig>): Promise<void>;
  
  getUserMFAMethods(userId: UserId): Promise<MFAMethod[]>;
  setupMFAMethod(request: MFASetupRequest): Promise<MFASetupResult>;
  verifyMFASetup(methodId: string, code: string): Promise<ValidationResult>;
  removeMFAMethod(methodId: string): Promise<void>;
  setPrimaryMFAMethod(userId: UserId, methodId: string): Promise<void>;

  initiateMFAChallenge(userId: UserId, methodType?: MFAMethodType): Promise<MFAChallenge>;
  verifyMFAChallenge(request: MFAVerificationRequest): Promise<MFAVerificationResult>;
  resendMFACode(challengeId: string): Promise<boolean>;

  generateBackupCodes(userId: UserId): Promise<BackupCodesGeneration>;
  useBackupCode(userId: UserId, code: string): Promise<boolean>;
  getRecoveryOptions(userId: UserId): Promise<RecoveryOptions>;

  trustDevice(userId: UserId, request: DeviceTrustRequest): Promise<DeviceTrustResult>;
  isDeviceTrusted(userId: UserId, deviceFingerprint: string): Promise<boolean>;
  getTrustedDevices(userId: UserId): Promise<TrustedDevice[]>;
  revokeTrustedDevice(deviceId: string): Promise<void>;
}

export interface MagicLinkService {
  getMagicLinkConfig(): Promise<MagicLinkConfig>;
  updateMagicLinkConfig(config: Partial<MagicLinkConfig>): Promise<void>;

  generateMagicLink(request: MagicLinkRequest): Promise<MagicLinkResult>;
  sendMagicLink(linkId: string): Promise<boolean>;

  verifyMagicLink(token: string): Promise<MagicLinkVerificationResult>;
  revokeMagicLink(linkId: string): Promise<void>;

  getMagicLink(linkId: string): Promise<MagicLink | null>;
  getUserMagicLinks(email: string): Promise<MagicLink[]>;
  cleanupExpiredLinks(): Promise<number>;
}

export interface PasswordlessAuthService {
  initiatePasswordlessAuth(request: PasswordlessAuthRequest): Promise<PasswordlessAuthResult>;
  verifyPasswordlessAuth(challengeId: string, code: string): Promise<MagicLinkVerificationResult>;

  isPasswordlessEnabled(email: string): Promise<boolean>;
  getPasswordlessOptions(email: string): Promise<MFAMethodType[]>;
}


export interface MFAError extends Error {
  code: MFAErrorCode;
  methodType?: MFAMethodType;
  attemptsRemaining?: number;
  retryAfter?: string;
}

export enum MFAErrorCode {
  MFA_NOT_SETUP = 'MFA_NOT_SETUP',
  MFA_REQUIRED = 'MFA_REQUIRED',
  INVALID_CODE = 'INVALID_CODE',
  CODE_EXPIRED = 'CODE_EXPIRED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
  METHOD_NOT_FOUND = 'METHOD_NOT_FOUND',
  METHOD_ALREADY_EXISTS = 'METHOD_ALREADY_EXISTS',
  DEVICE_NOT_TRUSTED = 'DEVICE_NOT_TRUSTED',
  BACKUP_CODE_USED = 'BACKUP_CODE_USED',
  MAGIC_LINK_EXPIRED = 'MAGIC_LINK_EXPIRED',
  MAGIC_LINK_USED = 'MAGIC_LINK_USED',
  RATE_LIMITED = 'RATE_LIMITED'
}

export type MFAEventType = 
  | 'mfa_challenge_created'
  | 'mfa_verification_success'
  | 'mfa_verification_failed'
  | 'mfa_method_added'
  | 'mfa_method_removed'
  | 'magic_link_generated'
  | 'magic_link_used'
  | 'device_trusted'
  | 'passwordless_auth_success';

export interface MFAEvent {
  id: string;
  type: MFAEventType;
  userId: UserId;
  timestamp: string;
  data: {
    methodType?: MFAMethodType;
    methodId?: string;
    challengeId?: string;
    success?: boolean;
    deviceFingerprint?: string;
    ip?: string;
    userAgent?: string;
    correlationId?: CorrelationId;
    email?: string;
    action?: string;
    attemptsRemaining?: number;
    [key: string]: any; // Pour permettre d'autres propriétés
  };
}

export type MFAEventCallback = (event: MFAEvent) => void | Promise<void>;

export const MFA_CONSTANTS = {
  DEFAULT_CODE_LENGTH: 6,
  DEFAULT_CODE_EXPIRY: 300, // 5 minutes
  DEFAULT_MAX_ATTEMPTS: 3,
  DEFAULT_BACKUP_CODES_COUNT: 10,
  DEFAULT_DEVICE_TRUST_DAYS: 30,
  DEFAULT_MAGIC_LINK_EXPIRY: 1800, // 30 minutes
  
  RATE_LIMIT: {
    MAX_ATTEMPTS: 5,
    WINDOW_MINUTES: 15,
    LOCKOUT_MINUTES: 60
  },
  
  TOTP: {
    WINDOW: 1,
    STEP: 30,
    ALGORITHM: 'SHA1'
  },
  
  WEBAUTHN: {
    TIMEOUT: 60000,
    USER_VERIFICATION: 'preferred'
  }
} as const;