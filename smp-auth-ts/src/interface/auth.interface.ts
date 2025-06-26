/**
 * Interface principale pour l'authentification et l'autorisation
 * Version simplifiée avec fonctionnalités essentielles
 */

import type {
  OperationOptions,
  OperationResult,
  ValidationResult,
  AuthorizationResult,
  UserId,
  SessionId,
  Priority
} from './common.js';

// ============================================================================
// TYPES DE BASE ET ENUMS
// ============================================================================

export type AuthEventType = 'login' | 'logout' | 'token_refresh' | 'token_validation' | 'authorization_check' | 'error';
export type UserState = 'active' | 'inactive' | 'suspended' | 'locked';

export enum ErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_TIMEOUT = 'SERVICE_TIMEOUT',
  AUTH_USER_NOT_FOUND = 'AUTH_USER_NOT_FOUND'
}

// ============================================================================
// CONFIGURATION KEYCLOAK
// ============================================================================

export interface KeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  timeout?: number;
  adminClientId?: string;
  adminClientSecret?: string;
  enableCache?: boolean;
  cacheExpiry?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

// ============================================================================
// STRUCTURES DE DONNÉES UTILISATEUR
// ============================================================================

export interface UserInfo {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  roles: string[];
  organization_ids?: string[];
  state?: UserState;
  attributes?: UserAttributes;
  resource_access?: Record<string, { roles: string[] }>;
  realm_access?: { roles: string[] };
  created_at?: string;
  updated_at?: string;
  email_verified?: boolean;
}

export interface UserAttributes {
  department?: string;
  clearanceLevel?: number;
  contractExpiryDate?: string;
  managerId?: string;
  jobTitle?: string;
  businessUnit?: string;
  workLocation?: string;
  employmentType?: string;
  verificationStatus?: string;
  riskScore?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  [key: string]: any;
}

export interface KeycloakUserData {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  groups?: string[];
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;
}

export interface KeycloakTokenIntrospection {
  active: boolean;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  aud?: string | string[];
  iss?: string;
  [key: string]: any;
}

export interface UserRegistrationData {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}

export interface UserRegistrationResult {
  success: boolean;
  userId?: string;
  message: string;
  errors?: string[];
}

// ============================================================================
// INTERFACES D'AUTHENTIFICATION
// ============================================================================

export interface IAuthenticationService {
  // Authentification de base
  login(username: string, password: string): Promise<AuthResponse>;
  refreshToken(refreshToken: string): Promise<AuthResponse>;
  logout(token: string): Promise<void>;
  
  // Validation de tokens
  validateToken(token: string): Promise<TokenValidationResult>;
  
  // Tokens de service
  getClientCredentialsToken(): Promise<AuthResponse>;
  
  // Gestion des utilisateurs
  getUserInfo(userId: string): Promise<UserInfo | null>;
  getUserRoles(userId: string): Promise<string[]>;

  registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult>;
  verifyEmail(userId: string, token: string): Promise<boolean>;
  resendVerificationEmail(userId: string): Promise<boolean>;
  resetPassword(email: string): Promise<boolean>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean>;
  
  // Cache
  invalidateUserCache(userId: string): Promise<void>;
  
  // Tests de connectivité
  testKeycloakConnection(): Promise<ConnectionTestResult>;
  testRedisConnection(): Promise<ConnectionTestResult>;
  testOPAConnection(): Promise<ConnectionTestResult>;
  
  // Autorisation
  checkPermission(token: string, resourceId: string, resourceType: string, action: string, context?: Record<string, any>): Promise<boolean>;
  checkPermissionDetailed(token: string, resourceId: string, resourceType: string, action: string, context?: Record<string, any>): Promise<AuthorizationResult>;
  
  // Métriques et surveillance
  getMetrics(): Record<string, any>;
  resetMetrics(): void;
  
  // Gestion des événements
  addEventListener(eventType: AuthEventType, callback: EventCallback): void;
  removeEventListener(eventType: AuthEventType, callback: EventCallback): void;
  
  // Fermeture
  close(): Promise<void>;
}

export interface KeycloakClient {
  validateToken(token: string): Promise<UserInfo>;
  getRoles(userId: string): Promise<string[]>;
  getUserInfos(userId: string): Promise<UserInfo | null>;
 // getUserInfo(userId: string): Promise<UserInfo>;
  getAdminToken(): Promise<string>;
  login?(username: string, password: string): Promise<AuthResponse>;
  refreshToken?(refreshToken: string): Promise<AuthResponse>;
  logout?(token: string): Promise<void>;
  getClientCredentialsToken?(): Promise<AuthResponse>;
  healthCheck?(): Promise<boolean>;
}

export interface KeycloakClientExtended extends KeycloakClient {
  validateTokenRaw(token: string): Promise<KeycloakTokenIntrospection>;
  getUserData(userId: string): Promise<KeycloakUserData>;
  refreshAdminToken(): Promise<string>;
  createUser(userData: Partial<KeycloakUserData>): Promise<string>;
  updateUser(userId: string, userData: Partial<KeycloakUserData>): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  searchUsers(query: string, limit?: number): Promise<KeycloakUserData[]>;
  getUserByUsername(username: string): Promise<KeycloakUserData | null>;
  getUserByEmail(email: string): Promise<KeycloakUserData | null>;
  healthCheck(): Promise<boolean>;
  getServerInfo(): Promise<any>;
  validateConfig(): ValidationResult;
  testConnection(): Promise<ConnectionTestResult>;
  registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult>;
  verifyEmail(userId: string, token: string): Promise<boolean>;
  resetPassword(email: string): Promise<boolean>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean>;
  sendVerificationEmail(userId: string, adminToken: string): Promise<void>;
  assignDefaultRoles(userId: string, adminToken: string): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// RÉPONSES ET RÉSULTATS
// ============================================================================

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  session_id?: string;
  session_state?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  roles?: string[];
  expiresAt?: string;
  issuedAt?: string;
  clientId?: string;
  scope?: string[];
}

export interface EnrichedTokenValidationResult {
  valid: boolean;
  userInfo?: UserInfo;
  userId?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  roles?: string[];
  rawKeycloakData?: KeycloakTokenIntrospection;
}

export interface ConnectionTestResult {
  connected: boolean;
  info?: string;
  error?: string;
  latency?: number;
  details?: Record<string, any>;
  timestamp?: string;
  version?: string;
}

// ============================================================================
// CONFIGURATION ET OPTIONS
// ============================================================================

export interface AuthenticationOptions {
  enableCache?: boolean;
  cacheExpiry?: number;
  enableLogging?: boolean;
  enableSessionTracking?: boolean;
  maxSessions?: number;
  tokenValidationStrategy?: 'introspection' | 'jwt_decode' | 'userinfo';
  development?: {
    enableDebugLogging?: boolean;
    mockMode?: boolean;
    bypassAuthentication?: boolean;
  };
}

// ============================================================================
// ÉVÉNEMENTS ET LOGS
// ============================================================================

export interface AuthEvent {
  id: string;
  type: AuthEventType;
  userId?: string;
  username?: string;
  success: boolean;
  timestamp: string;
  duration?: number;
  error?: string;
  details?: Record<string, any>;
}

export type EventCallback = (event: AuthEvent) => Promise<void> | void;