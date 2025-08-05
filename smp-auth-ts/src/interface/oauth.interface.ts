// smp-auth-ts/src/interface/oauth.interface.ts
export interface OAuthProvider {
  name: string;
  generateAuthUrl(state?: string): string;
  exchangeCodeForToken(code: string, state?: string): Promise<OAuthTokenResponse>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  refreshToken?(refreshToken: string): Promise<OAuthTokenResponse>;
  revokeToken?(token: string): Promise<void>;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string; // Pour OpenID Connect
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  username?: string;
  verified?: boolean;
  locale?: string;
  provider: string;
  raw?: Record<string, any>; // Données brutes du provider
}

export interface OAuthAuthorizationRequest {
  provider: 'google' | 'github';
  state?: string;
  redirectUri?: string;
  scopes?: string[];
  additionalParams?: Record<string, string>;
}

export interface OAuthAuthorizationResponse {
  authUrl: string;
  state: string;
  provider: string;
}

export interface OAuthCallbackRequest {
  provider: 'google' | 'github';
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  userInfo?: OAuthUserInfo;
  tokens?: OAuthTokenResponse;
  keycloakTokens?: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };
  message?: string;
  error?: string;
}

export interface OAuthService {
  getAuthorizationUrl(request: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResponse>;
  handleCallback(request: OAuthCallbackRequest): Promise<OAuthCallbackResponse>;
  linkAccount(userId: string, provider: string, providerUserId: string): Promise<boolean>;
  unlinkAccount(userId: string, provider: string): Promise<boolean>;
  getLinkedAccounts(userId: string): Promise<LinkedAccount[]>;
  refreshProviderToken(userId: string, provider: string): Promise<OAuthTokenResponse | null>;
}

export interface LinkedAccount {
  userId: string;
  provider: string;
  providerUserId: string;
  email: string;
  username?: string;
  linkedAt: string;
  lastSync?: string;
  metadata?: Record<string, any>;
}

export interface OAuthState {
  provider: string;
  redirectUri?: string;
  userId?: string; // Pour account linking
  timestamp: number;
  nonce: string;
  originalUrl?: string;
}

export interface ProviderUserMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  verified?: boolean;
  attributes?: Record<string, any>;
}

export interface KeycloakBrokerConfig {
  alias: string;
  providerId: string;
  enabled: boolean;
  trustEmail: boolean;
  storeToken: boolean;
  addReadTokenRoleOnCreate: boolean;
  authenticateByDefault: boolean;
  linkOnly: boolean;
  firstBrokerLoginFlowAlias?: string;
  postBrokerLoginFlowAlias?: string;
  config: Record<string, string>;
}

export type OAuthEventType = 
  | 'oauth_authorization_started'
  | 'oauth_authorization_completed'
  | 'oauth_authorization_failed'
  | 'oauth_user_info_retrieved'
  | 'oauth_account_linked'
  | 'oauth_account_unlinked'
  | 'oauth_token_refreshed';

export interface OAuthEvent {
  id: string;
  type: OAuthEventType;
  provider: string;
  userId?: string;
  email?: string;
  success: boolean;
  timestamp: string;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export type OAuthEventCallback = (event: OAuthEvent) => void | Promise<void>;