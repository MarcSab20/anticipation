export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  enabled: boolean;
}

export interface GoogleOAuthConfig extends OAuthProviderConfig {
  hostedDomain?: string; 
  accessType?: 'online' | 'offline';
  prompt?: 'none' | 'consent' | 'select_account';
}

export interface GitHubOAuthConfig extends OAuthProviderConfig {
  allowSignup?: boolean;
  teamId?: string; 
  organizationId?: string; 
  timeout?: number
  retryAttempts?: number;
  retryDelay?: number;
}

export interface OAuthConfig {
  google?: GoogleOAuthConfig;
  github?: GitHubOAuthConfig;
  keycloak: {
    brokerCallbackUrl: string; 
    defaultRoles: string[];
    autoCreateUser: boolean;
    syncMode: 'import' | 'legacy' | 'force';
  };
}

export const defaultOAuthConfig: Partial<OAuthConfig> = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback/google`,
    scopes: ['openid', 'email', 'profile'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
    hostedDomain: process.env.GOOGLE_HOSTED_DOMAIN,
    accessType: 'online',
    prompt: 'select_account'
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback/github`,
    scopes: ['user:email', 'read:user'],
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    enabled: process.env.GITHUB_OAUTH_ENABLED === 'true',
    allowSignup: true,
    organizationId: process.env.GITHUB_ORGANIZATION_ID
  },
  keycloak: {
    brokerCallbackUrl: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/broker/{alias}/endpoint`,
    defaultRoles: ['USER'],
    autoCreateUser: true,
    syncMode: 'import'
  }
};

export function loadOAuthConfig(overrides?: Partial<OAuthConfig>): OAuthConfig {
  return {
    ...defaultOAuthConfig,
    ...overrides,
    google: {
      ...defaultOAuthConfig.google,
      ...overrides?.google
    },
    github: {
      ...defaultOAuthConfig.github,
      ...overrides?.github
    },
    keycloak: {
      ...defaultOAuthConfig.keycloak,
      ...overrides?.keycloak
    }
  } as OAuthConfig;
}