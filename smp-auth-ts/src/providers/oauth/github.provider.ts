// smp-auth-ts/src/providers/oauth/github.provider.ts - Version corrigée
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { 
  OAuthProvider, 
  OAuthTokenResponse, 
  OAuthUserInfo 
} from '../../interface/oauth.interface.js';
import { GitHubOAuthConfig } from '../../config/oauth.config.js';

interface GitHubTokenRequest {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  blog?: string;
  company?: string;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
}

interface GitHubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string;
}

export class GitHubOAuthProvider implements OAuthProvider {
  public readonly name = 'github';
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000;
  
  constructor(private readonly config: GitHubOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('GitHub OAuth configuration is incomplete');
    }
  }

  generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      response_type: 'code'
    });

    if (state) {
      params.append('state', state);
    }

    if (this.config.allowSignup !== undefined) {
      params.append('allow_signup', this.config.allowSignup.toString());
    }

    console.log(`🔐 [GITHUB-PROVIDER] Generated auth URL: ${this.config.authUrl}?${params.toString()}`);
    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, state?: string): Promise<OAuthTokenResponse> {
    console.log('🔄 [GITHUB-PROVIDER] Starting token exchange...');
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 [GITHUB-PROVIDER] Token exchange attempt ${attempt}/${this.maxRetries}`);
        
        const tokenResponse = await this.makeTokenRequest(code);
        
        console.log('✅ [GITHUB-PROVIDER] Token exchange successful');
        return tokenResponse;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt === this.maxRetries;
        
        console.log(`❌ [GITHUB-PROVIDER] Token exchange attempt ${attempt} failed:`, {
          error: lastError.message,
          code: (lastError as any).code,
          status: (lastError as any).status,
          isRetryable,
          isLastAttempt
        });
        
        if (!isRetryable || isLastAttempt) {
          break;
        }
        
        const delay = this.retryDelay * attempt;
        console.log(`⏳ [GITHUB-PROVIDER] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log('❌ [GITHUB-PROVIDER] Token exchange failed after all attempts:', lastError?.message);
    throw new Error(`GitHub OAuth error: ${lastError?.message} (Code: ${(lastError as any)?.code || 'UNKNOWN'})`);
  }

  private async makeTokenRequest(code: string): Promise<OAuthTokenResponse> {
    console.log('🔄 [GITHUB-PROVIDER] Making request to GitHub token endpoint...');
    
    const requestData: GitHubTokenRequest = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri
    };

    console.log('🔍 [GITHUB-PROVIDER] Request data:', {
      client_id: requestData.client_id,
      redirect_uri: requestData.redirect_uri,
      code: `${code.substring(0, 10)}...`
    });

    // 🔧 FIX PRINCIPAL: Configuration axios simplifiée et correcte
    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: this.config.tokenUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'SMP-Auth-Service/1.0.0'
      },
      data: requestData,
      timeout: 30000,
      // 🔧 FIX: Supprimer toute configuration d'agent problématique
      // Ne pas définir d'agent du tout, laisser axios gérer
    };

    try {
      const response = await axios(axiosConfig);
      
      console.log('🔍 [GITHUB-PROVIDER] Raw response status:', response.status);
      console.log('🔍 [GITHUB-PROVIDER] Raw response headers:', response.headers);
      
      const responseData: GitHubTokenResponse = response.data;
      
      // Vérifier les erreurs dans la réponse
      if (responseData.error) {
        throw new Error(`GitHub API error: ${responseData.error}${responseData.error_description ? ` - ${responseData.error_description}` : ''}`);
      }

      if (!responseData.access_token) {
        console.log('❌ [GITHUB-PROVIDER] No access token in response:', responseData);
        throw new Error('No access token received from GitHub');
      }

      console.log('✅ [GITHUB-PROVIDER] Token received successfully');
      
      return {
        access_token: responseData.access_token,
        token_type: responseData.token_type || 'bearer',
        expires_in: responseData.expires_in || 28800, // GitHub tokens durent 8h par défaut
        refresh_token: responseData.refresh_token,
        scope: responseData.scope
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log('❌ [GITHUB-PROVIDER] Axios error details:', {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data
        });

        // Gestion spécifique des erreurs Axios
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Connection refused to GitHub API');
        }
        
        if (error.code === 'ETIMEDOUT') {
          throw new Error('Request timeout to GitHub API');
        }
        
        if (error.response?.status === 400) {
          const errorData = error.response.data;
          throw new Error(`GitHub API error: ${errorData.error || 'Bad Request'}${errorData.error_description ? ` - ${errorData.error_description}` : ''}`);
        }
        
        if (error.response?.status === 401) {
          throw new Error('GitHub OAuth credentials are invalid');
        }
        
        // if (error.response?.status >= 500) {
        //   throw new Error('GitHub API server error (retryable)');
        // }
        
        throw error;
      }
      
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      // Erreurs réseau retryables
      if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(error.code || '')) {
        return true;
      }
      
      // Codes HTTP retryables
      if (error.response?.status && error.response.status >= 500) {
        return true;
      }
      
      // Rate limiting
      if (error.response?.status === 429) {
        return true;
      }
    }
    
    // Erreurs système Node.js retryables
    if (error.code === 'ERR_INVALID_ARG_TYPE') {
      return false; // Cette erreur spécifique n'est pas retryable
    }
    
    return false;
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      console.log('🔄 [GITHUB-PROVIDER] Fetching user info...');
      
      // Configuration axios simplifiée pour getUserInfo aussi
      const userResponse = await axios({
        method: 'GET',
        url: this.config.userInfoUrl,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        timeout: 30000
      });

      const userData: GitHubUserResponse = userResponse.data;
      console.log('✅ [GITHUB-PROVIDER] User info retrieved:', { 
        id: userData.id, 
        login: userData.login,
        email: userData.email 
      });

      // Récupérer les emails si pas d'email public
      let email = userData.email;
      let verified = false;

      if (!email || email === null) {
        try {
          console.log('🔄 [GITHUB-PROVIDER] Fetching user emails...');
          
          const emailsResponse = await axios({
            method: 'GET',
            url: 'https://api.github.com/user/emails',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'SMP-Auth-Service/1.0.0'
            },
            timeout: 30000
          });

          const emails: GitHubEmailResponse[] = emailsResponse.data;
          console.log('🔍 [GITHUB-PROVIDER] Available emails:', emails.map(e => ({ email: e.email, primary: e.primary, verified: e.verified })));

          const primaryEmail = emails.find(e => e.primary && e.verified);
          if (primaryEmail) {
            email = primaryEmail.email;
            verified = primaryEmail.verified;
          } else {
            const verifiedEmail = emails.find(e => e.verified);
            if (verifiedEmail) {
              email = verifiedEmail.email;
              verified = verifiedEmail.verified;
            }
          }
        } catch (emailError) {
          console.warn('⚠️ [GITHUB-PROVIDER] Failed to fetch GitHub emails:', emailError);
        }
      }

      if (!email) {
        throw new Error('No email address found for GitHub user');
      }

      // Vérifier l'organisation si configurée
      if (this.config.organizationId) {
        await this.checkOrganizationMembership(accessToken, this.config.organizationId);
      }

      // Vérifier l'équipe si configurée
      if (this.config.teamId) {
        await this.checkTeamMembership(accessToken, this.config.teamId);
      }

      // Extraire prénom et nom du nom complet
      const nameParts = userData.name?.split(' ') || [];
      const firstName = nameParts[0] || userData.login;
      const lastName = nameParts.slice(1).join(' ') || undefined;

      const userInfo: OAuthUserInfo = {
        id: userData.id.toString(),
        email,
        name: userData.name || userData.login,
        firstName,
        lastName,
        avatarUrl: userData.avatar_url,
        username: userData.login,
        verified,
        provider: this.name,
        raw: {
          ...userData,
          bio: userData.bio,
          location: userData.location,
          blog: userData.blog,
          company: userData.company,
          public_repos: userData.public_repos,
          followers: userData.followers,
          following: userData.following
        }
      };

      console.log('✅ [GITHUB-PROVIDER] User info processed successfully');
      return userInfo;

    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] User info retrieval failed:', error);
      throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    // GitHub ne prend pas en charge les refresh tokens dans OAuth Apps
    // Seules les GitHub Apps peuvent utiliser les refresh tokens
    throw new Error('GitHub OAuth Apps do not support token refresh. Use GitHub Apps for refresh token support.');
  }

  async revokeToken(token: string): Promise<void> {
    try {
      console.log('🔄 [GITHUB-PROVIDER] Revoking token...');
      
      await axios({
        method: 'DELETE',
        url: `https://api.github.com/applications/${this.config.clientId}/grant`,
        auth: {
          username: this.config.clientId,
          password: this.config.clientSecret
        },
        data: {
          access_token: token
        },
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        timeout: 30000
      });
      
      console.log('✅ [GITHUB-PROVIDER] Token revoked successfully');
      
    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] Token revocation failed:', error);
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Vérifie l'appartenance à une organisation GitHub
   */
  private async checkOrganizationMembership(accessToken: string, orgId: string): Promise<void> {
    try {
      await axios({
        method: 'GET',
        url: `https://api.github.com/orgs/${orgId}/members`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        timeout: 30000
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`User is not a member of organization ${orgId}`);
      }
      throw new Error(`Failed to verify organization membership: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Vérifie l'appartenance à une équipe GitHub
   */
  private async checkTeamMembership(accessToken: string, teamId: string): Promise<void> {
    try {
      await axios({
        method: 'GET',
        url: `https://api.github.com/teams/${teamId}/memberships/`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        timeout: 30000
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`User is not a member of team ${teamId}`);
      }
      throw new Error(`Failed to verify team membership: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtient les organisations de l'utilisateur
   */
  async getUserOrganizations(accessToken: string): Promise<Array<{id: number, login: string, avatar_url: string}>> {
    try {
      const response = await axios({
        method: 'GET',
        url: 'https://api.github.com/user/orgs',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        timeout: 30000
      });

      return response.data.map((org: any) => ({
        id: org.id,
        login: org.login,
        avatar_url: org.avatar_url
      }));
    } catch (error) {
      console.error('Failed to get user organizations:', error);
      return [];
    }
  }

  /**
   * Obtient les repositories publics de l'utilisateur
   */
  async getUserRepositories(accessToken: string, type: 'all' | 'owner' | 'member' = 'owner'): Promise<Array<{
    id: number,
    name: string,
    full_name: string,
    private: boolean,
    language: string
  }>> {
    try {
      const response = await axios({
        method: 'GET',
        url: 'https://api.github.com/user/repos',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/1.0.0'
        },
        params: {
          type,
          per_page: 100,
          sort: 'updated'
        },
        timeout: 30000
      });

      return response.data.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        language: repo.language
      }));
    } catch (error) {
      console.error('Failed to get user repositories:', error);
      return [];
    }
  }
}