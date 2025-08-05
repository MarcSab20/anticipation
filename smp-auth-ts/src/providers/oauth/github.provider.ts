// smp-auth-ts/src/providers/oauth/github.provider.ts
import axios from 'axios';
import { 
  OAuthProvider, 
  OAuthTokenResponse, 
  OAuthUserInfo 
} from '../../interface/oauth.interface.js';
import { GitHubOAuthConfig } from '../../config/oauth.config.js';

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

    return `${this.config.authUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, state?: string): Promise<OAuthTokenResponse> {
    try {
      const response = await axios.post(this.config.tokenUrl, {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'SMP-Auth-Service'
        }
      });

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type || 'bearer',
        expires_in: response.data.expires_in || 28800, // GitHub tokens durent 8h par défaut
        refresh_token: response.data.refresh_token,
        scope: response.data.scope
      };
    } catch (error) {
      console.error('GitHub token exchange failed:', error);
      throw new Error(`Failed to exchange code for token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      // Récupérer les informations utilisateur de base
      const userResponse = await axios.get<GitHubUserResponse>(this.config.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        }
      });

      const userData = userResponse.data;

      // Récupérer les emails si pas d'email public
      let email = userData.email;
      let verified = false;

      if (!email || email === null) {
        try {
          const emailsResponse = await axios.get<GitHubEmailResponse[]>('https://api.github.com/user/emails', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'SMP-Auth-Service'
            }
          });

          const primaryEmail = emailsResponse.data.find(e => e.primary && e.verified);
          if (primaryEmail) {
            email = primaryEmail.email;
            verified = primaryEmail.verified;
          } else {
            const verifiedEmail = emailsResponse.data.find(e => e.verified);
            if (verifiedEmail) {
              email = verifiedEmail.email;
              verified = verifiedEmail.verified;
            }
          }
        } catch (emailError) {
          console.warn('Failed to fetch GitHub emails:', emailError);
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

      return {
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
    } catch (error) {
      console.error('GitHub user info retrieval failed:', error);
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
      await axios.delete(`https://api.github.com/applications/${this.config.clientId}/grant`, {
        auth: {
          username: this.config.clientId,
          password: this.config.clientSecret
        },
        data: {
          access_token: token
        },
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        }
      });
    } catch (error) {
      console.error('GitHub token revocation failed:', error);
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Vérifie l'appartenance à une organisation GitHub
   */
  private async checkOrganizationMembership(accessToken: string, orgId: string): Promise<void> {
    try {
      await axios.get(`https://api.github.com/orgs/${orgId}/members`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        }
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
      await axios.get(`https://api.github.com/teams/${teamId}/memberships/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        }
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
      const response = await axios.get('https://api.github.com/user/orgs', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        }
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
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service'
        },
        params: {
          type,
          per_page: 100,
          sort: 'updated'
        }
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