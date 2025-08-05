// smp-auth-ts/src/services/oauth.service.ts
import { createHash, randomBytes } from 'crypto';
import {
  OAuthService,
  OAuthProvider,
  OAuthAuthorizationRequest,
  OAuthAuthorizationResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  OAuthState,
  LinkedAccount,
  OAuthTokenResponse,
  OAuthEvent,
  OAuthEventCallback,
  OAuthEventType
} from '../interface/oauth.interface.js';
import { RedisClient } from '../interface/redis.interface.js';
import { KeycloakClient } from '../interface/auth.interface.js';
import { OAuthConfig } from '../config/oauth.config.js';
import { GoogleOAuthProvider } from '../providers/oauth/google.provider.js';
import { GitHubOAuthProvider } from '../providers/oauth/github.provider.js';

export class OAuthServiceImpl implements OAuthService {
  checkHealth() {
    throw new Error('Method not implemented.');
  }
  private readonly providers: Map<string, OAuthProvider> = new Map();
  private readonly eventCallbacks: Map<OAuthEventType, OAuthEventCallback[]> = new Map();
  private readonly stateExpiry = 10 * 60; // 10 minutes

  constructor(
    private readonly redisClient: RedisClient,
    private readonly keycloakClient: KeycloakClient,
    private readonly config: OAuthConfig
  ) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (this.config.google?.enabled && this.config.google.clientId) {
      const googleProvider = new GoogleOAuthProvider(this.config.google);
      this.providers.set('google', googleProvider);
      console.log('✅ Google OAuth provider initialized');
    }

    if (this.config.github?.enabled && this.config.github.clientId) {
      const githubProvider = new GitHubOAuthProvider(this.config.github);
      this.providers.set('github', githubProvider);
      console.log('✅ GitHub OAuth provider initialized');
    }

    console.log(`📱 OAuth service initialized with ${this.providers.size} provider(s)`);
  }

  async getAuthorizationUrl(request: OAuthAuthorizationRequest): Promise<OAuthAuthorizationResponse> {
    const startTime = Date.now();
    
    try {
      const provider = this.providers.get(request.provider);
      if (!provider) {
        throw new Error(`OAuth provider ${request.provider} not found or not enabled`);
      }

      // Générer et stocker l'état
      const state = await this.generateAndStoreState({
        provider: request.provider,
        redirectUri: request.redirectUri,
        userId: undefined, // Pour l'authentification, pas de userId
        timestamp: Date.now(),
        nonce: this.generateNonce(),
        originalUrl: request.additionalParams?.originalUrl
      });

      // Générer l'URL d'autorisation
      const authUrl = provider.generateAuthUrl(state);

      await this.emitEvent({
        type: 'oauth_authorization_started',
        provider: request.provider,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        metadata: {
          scopes: request.scopes,
          redirectUri: request.redirectUri
        }
      });

      return {
        authUrl,
        state,
        provider: request.provider
      };

    } catch (error) {
      await this.emitEvent({
        type: 'oauth_authorization_failed',
        provider: request.provider,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  async handleCallback(request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> {
    const startTime = Date.now();
    
    try {
      // Vérifier les erreurs OAuth
      if (request.error) {
        throw new Error(`OAuth error: ${request.error}${request.error_description ? ` - ${request.error_description}` : ''}`);
      }

      if (!request.code) {
        throw new Error('Authorization code not provided');
      }

      // Récupérer et valider l'état
      const stateData = await this.validateAndRetrieveState(request.state);
      if (stateData.provider !== request.provider) {
        throw new Error('Provider mismatch in state');
      }

      const provider = this.providers.get(request.provider);
      if (!provider) {
        throw new Error(`OAuth provider ${request.provider} not found`);
      }

      // Échanger le code contre un token
      const tokens = await provider.exchangeCodeForToken(request.code, request.state);

      // Récupérer les informations utilisateur
      const userInfo = await provider.getUserInfo(tokens.access_token);

      await this.emitEvent({
        type: 'oauth_user_info_retrieved',
        provider: request.provider,
        email: userInfo.email,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        metadata: {
          userId: userInfo.id,
          username: userInfo.username
        }
      });

      // Créer ou récupérer l'utilisateur via Keycloak
      const keycloakTokens = await this.handleKeycloakIntegration(userInfo, tokens);

      await this.emitEvent({
        type: 'oauth_authorization_completed',
        provider: request.provider,
        email: userInfo.email,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        metadata: {
          hasKeycloakTokens: !!keycloakTokens
        }
      });

      return {
        success: true,
        userInfo,
        tokens,
        keycloakTokens,
        message: 'OAuth authentication successful'
      };

    } catch (error) {
      await this.emitEvent({
        type: 'oauth_authorization_failed',
        provider: request.provider,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'OAuth authentication failed'
      };
    }
  }

  async linkAccount(userId: string, provider: string, providerUserId: string): Promise<boolean> {
    try {
      // Vérifier que le provider existe
      if (!this.providers.has(provider)) {
        throw new Error(`Provider ${provider} not found`);
      }

      // Créer le lien de compte
      const linkedAccount: LinkedAccount = {
        userId,
        provider,
        providerUserId,
        email: '', // À récupérer depuis le provider
        linkedAt: new Date().toISOString(),
        metadata: {}
      };

      // Stocker dans Redis
      const key = `oauth:linked:${userId}:${provider}`;
      await this.redisClient.set(key, JSON.stringify(linkedAccount), { ttl: 0 }); // Pas d'expiration

      // Indexer pour recherche inverse
      const reverseKey = `oauth:user:${provider}:${providerUserId}`;
      await this.redisClient.set(reverseKey, userId, { ttl: 0 });

      await this.emitEvent({
        type: 'oauth_account_linked',
        provider,
        userId,
        success: true,
        timestamp: new Date().toISOString(),
        metadata: { providerUserId }
      });

      return true;

    } catch (error) {
      console.error(`Failed to link account for user ${userId} with ${provider}:`, error);
      return false;
    }
  }

  async unlinkAccount(userId: string, provider: string): Promise<boolean> {
    try {
      // Récupérer le compte lié pour obtenir le providerUserId
      const linkedAccount = await this.getLinkedAccount(userId, provider);
      if (!linkedAccount) {
        return false;
      }

      // Supprimer les clés Redis
      const key = `oauth:linked:${userId}:${provider}`;
      const reverseKey = `oauth:user:${provider}:${linkedAccount.providerUserId}`;
      
      await Promise.all([
        this.redisClient.delete(key),
        this.redisClient.delete(reverseKey)
      ]);

      await this.emitEvent({
        type: 'oauth_account_unlinked',
        provider,
        userId,
        success: true,
        timestamp: new Date().toISOString(),
        metadata: { providerUserId: linkedAccount.providerUserId }
      });

      return true;

    } catch (error) {
      console.error(`Failed to unlink account for user ${userId} with ${provider}:`, error);
      return false;
    }
  }

  async getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
    try {
      const accounts: LinkedAccount[] = [];
      
      for (const providerName of this.providers.keys()) {
        const key = `oauth:linked:${userId}:${providerName}`;
        const data = await this.redisClient.get(key);
        
        if (data) {
          accounts.push(JSON.parse(data));
        }
      }

      return accounts;

    } catch (error) {
      console.error(`Failed to get linked accounts for user ${userId}:`, error);
      return [];
    }
  }

  async refreshProviderToken(userId: string, provider: string): Promise<OAuthTokenResponse | null> {
    try {
      const oauthProvider = this.providers.get(provider);
      if (!oauthProvider || !oauthProvider.refreshToken) {
        return null;
      }

      // Récupérer le refresh token stocké
      const tokenKey = `oauth:tokens:${userId}:${provider}`;
      const tokenData = await this.redisClient.get(tokenKey);
      
      if (!tokenData) {
        return null;
      }

      const tokens = JSON.parse(tokenData);
      if (!tokens.refresh_token) {
        return null;
      }

      // Rafraîchir le token
      const newTokens = await oauthProvider.refreshToken(tokens.refresh_token);

      // Stocker les nouveaux tokens
      await this.redisClient.set(tokenKey, JSON.stringify(newTokens), { 
        ttl: newTokens.expires_in || 3600 
      });

      await this.emitEvent({
        type: 'oauth_token_refreshed',
        provider,
        userId,
        success: true,
        timestamp: new Date().toISOString(),
        metadata: { expiresIn: newTokens.expires_in }
      });

      return newTokens;

    } catch (error) {
      console.error(`Failed to refresh token for user ${userId} with ${provider}:`, error);
      return null;
    }
  }

  // Méthodes privées

  private async generateAndStoreState(stateData: OAuthState): Promise<string> {
    const state = this.generateStateToken();
    const key = `oauth:state:${state}`;
    
    await this.redisClient.set(key, JSON.stringify(stateData), { 
      ttl: this.stateExpiry 
    });

    return state;
  }

  private async validateAndRetrieveState(state: string): Promise<OAuthState> {
    const key = `oauth:state:${state}`;
    const data = await this.redisClient.get(key);
    
    if (!data) {
      throw new Error('Invalid or expired OAuth state');
    }

    // Supprimer l'état après utilisation (one-time use)
    await this.redisClient.delete(key);

    const stateData: OAuthState = JSON.parse(data);
    
    // Vérifier l'expiration
    if (Date.now() - stateData.timestamp > this.stateExpiry * 1000) {
      throw new Error('OAuth state expired');
    }

    return stateData;
  }

  private generateStateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  private async handleKeycloakIntegration(
    userInfo: any, 
    tokens: OAuthTokenResponse
  ): Promise<any> {
    try {
      // Vérifier si l'utilisateur existe déjà dans Keycloak
      let existingUser = await this.keycloakClient.getUserByEmail(userInfo.email);
      
      if (!existingUser) {
        // Créer un nouvel utilisateur si autorisé
        if (!this.config.keycloak.autoCreateUser) {
          throw new Error('User does not exist and auto-creation is disabled');
        }

        const registrationResult = await this.keycloakClient.registerUser({
          username: userInfo.username || userInfo.email,
          email: userInfo.email,
          password: this.generateRandomPassword(), // Mot de passe temporaire
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          enabled: true,
          emailVerified: userInfo.verified || false,
          attributes: {
            oauth_provider: [userInfo.provider],
            oauth_user_id: [userInfo.id],
            avatar_url: [userInfo.avatarUrl] 
          }
        });

        if (!registrationResult.success) {
          throw new Error(`Failed to create user: ${registrationResult.message}`);
        }

        existingUser = await this.keycloakClient.getUserByEmail(userInfo.email);
      } else {
        // Mettre à jour les attributs OAuth
        await this.updateUserOAuthAttributes(existingUser.id, userInfo);
      }

      if (!existingUser) {
        throw new Error('Failed to retrieve user after creation');
      }

      // Stocker les tokens OAuth
      await this.storeUserTokens(existingUser.id, userInfo.provider, tokens);

      // Créer une session Keycloak via un token administrateur puis l'utilisateur
      const adminToken = await this.keycloakClient.getAdminToken();
      
      // Utiliser impersonation ou créer un token pour l'utilisateur
      // Note: Ceci nécessite une configuration spéciale dans Keycloak
      const keycloakTokens = await this.createKeycloakSessionForUser(existingUser.id);

      return keycloakTokens;

    } catch (error) {
      console.error('Keycloak integration failed:', error);
      return null;
    }
  }

  private generateRandomPassword(): string {
    return randomBytes(16).toString('hex');
  }

  private async updateUserOAuthAttributes(userId: string, userInfo: any): Promise<void> {
    try {
      const adminToken = await this.keycloakClient.getAdminToken();
      
      // Cette fonction nécessiterait une extension du KeycloakClient
      // pour mettre à jour les attributs utilisateur
      console.log(`Would update OAuth attributes for user ${userId}`);
      
    } catch (error) {
      console.error('Failed to update OAuth attributes:', error);
    }
  }

  private async storeUserTokens(userId: string, provider: string, tokens: OAuthTokenResponse): Promise<void> {
    const key = `oauth:tokens:${userId}:${provider}`;
    await this.redisClient.set(key, JSON.stringify(tokens), { 
      ttl: tokens.expires_in || 3600 
    });
  }

  private async createKeycloakSessionForUser(userId: string): Promise<any> {
    // Cette fonction nécessiterait une implémentation spéciale
    // pour créer un token Keycloak pour un utilisateur sans mot de passe
    // Cela peut être fait via l'API admin de Keycloak ou en utilisant
    // des tokens de service
    
    try {
      // Approche simplifiée : retourner un token de service
      const serviceToken = await this.keycloakClient.getClientCredentialsToken!();
      
      return {
        access_token: serviceToken.access_token,
        refresh_token: serviceToken.refresh_token,
        expires_in: serviceToken.expires_in,
        token_type: serviceToken.token_type
      };
      
    } catch (error) {
      console.error('Failed to create Keycloak session:', error);
      return null;
    }
  }

  private async getLinkedAccount(userId: string, provider: string): Promise<LinkedAccount | null> {
    try {
      const key = `oauth:linked:${userId}:${provider}`;
      const data = await this.redisClient.get(key);
      
      return data ? JSON.parse(data) : null;
      
    } catch (error) {
      console.error(`Failed to get linked account for ${userId}:${provider}:`, error);
      return null;
    }
  }

  // Gestion des événements

  addEventListener(eventType: OAuthEventType, callback: OAuthEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  removeEventListener(eventType: OAuthEventType, callback: OAuthEventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private async emitEvent(event: Omit<OAuthEvent, 'id'>): Promise<void> {
    const fullEvent: OAuthEvent = {
      ...event,
      id: this.generateEventId()
    };

    const callbacks = this.eventCallbacks.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          await callback(fullEvent);
        } catch (error) {
          console.error(`OAuth event callback error for ${event.type}:`, error);
        }
      }
    }

    // Stocker l'événement pour audit
    try {
      const eventKey = `oauth:events:${fullEvent.id}`;
      await this.redisClient.set(eventKey, JSON.stringify(fullEvent), { 
        ttl: 7 * 24 * 60 * 60 // 7 jours
      });
    } catch (error) {
      console.error('Failed to store OAuth event:', error);
    }
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Méthodes utilitaires publiques

  getEnabledProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderEnabled(provider: string): boolean {
    return this.providers.has(provider);
  }

  async getProviderConfig(provider: string): Promise<any> {
    switch (provider) {
      case 'google':
        return this.config.google;
      case 'github':
        return this.config.github;
      default:
        return null;
    }
  }

  async close(): Promise<void> {
    console.log('OAuth service closed');
  }
}