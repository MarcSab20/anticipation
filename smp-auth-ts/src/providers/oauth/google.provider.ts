// smp-auth-ts/src/providers/oauth/google.provider.ts
import axios from 'axios';
import { 
  OAuthProvider, 
  OAuthTokenResponse, 
  OAuthUserInfo 
} from '../../interface/oauth.interface.js';
import { GoogleOAuthConfig } from '../../config/oauth.config.js';

export class GoogleOAuthProvider implements OAuthProvider {
  public readonly name = 'google';
  
  constructor(private readonly config: GoogleOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Google OAuth configuration is incomplete');
    }
  }

  generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code',
      access_type: this.config.accessType || 'online',
      prompt: this.config.prompt || 'select_account'
    });

    if (state) {
      params.append('state', state);
    }

    if (this.config.hostedDomain) {
      params.append('hd', this.config.hostedDomain);
    }

    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, state?: string): Promise<OAuthTokenResponse> {
    try {
      const response = await axios.post(this.config.tokenUrl, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in || 3600,
        refresh_token: response.data.refresh_token,
        scope: response.data.scope,
        id_token: response.data.id_token
      };
    } catch (error) {
      console.error('Google token exchange failed:', error);
      throw new Error(`Failed to exchange code for token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get(this.config.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      const userData = response.data;

      // Validation du domaine hébergé si configuré
      if (this.config.hostedDomain && userData.hd !== this.config.hostedDomain) {
        throw new Error(`User domain ${userData.hd} does not match required domain ${this.config.hostedDomain}`);
      }

      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        firstName: userData.given_name,
        lastName: userData.family_name,
        avatarUrl: userData.picture,
        username: userData.email?.split('@')[0],
        verified: userData.verified_email === true,
        locale: userData.locale,
        provider: this.name,
        raw: userData
      };
    } catch (error) {
      console.error('Google user info retrieval failed:', error);
      throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      const response = await axios.post(this.config.tokenUrl, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in || 3600,
        refresh_token: response.data.refresh_token || refreshToken, // Google peut ne pas renvoyer un nouveau refresh token
        scope: response.data.scope
      };
    } catch (error) {
      console.error('Google token refresh failed:', error);
      throw new Error(`Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await axios.post(`https://oauth2.googleapis.com/revoke`, null, {
        params: { token },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    } catch (error) {
      console.error('Google token revocation failed:', error);
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Valide un ID token Google (JWT)
   */
  async validateIdToken(idToken: string): Promise<any> {
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      
      // Vérifier l'audience (client ID)
      if (response.data.aud !== this.config.clientId) {
        throw new Error('Invalid token audience');
      }

      // Vérifier l'expiration
      const now = Math.floor(Date.now() / 1000);
      if (response.data.exp < now) {
        throw new Error('Token expired');
      }

      return response.data;
    } catch (error) {
      console.error('Google ID token validation failed:', error);
      throw new Error(`Failed to validate ID token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtient les informations utilisateur depuis l'ID token
   */
  getUserInfoFromIdToken(idToken: string): Promise<OAuthUserInfo> {
    return this.validateIdToken(idToken).then(tokenData => ({
      id: tokenData.sub,
      email: tokenData.email,
      name: tokenData.name,
      firstName: tokenData.given_name,
      lastName: tokenData.family_name,
      avatarUrl: tokenData.picture,
      username: tokenData.email?.split('@')[0],
      verified: tokenData.email_verified === 'true',
      locale: tokenData.locale,
      provider: this.name,
      raw: tokenData
    }));
  }
}