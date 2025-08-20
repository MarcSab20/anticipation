// smp-auth-ts/src/providers/oauth/github.provider.ts - Version corrigée
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { 
  OAuthProvider, 
  OAuthTokenResponse, 
  OAuthUserInfo 
} from '../../interface/oauth.interface.js';
import { GitHubOAuthConfig } from '../../config/oauth.config.js';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

interface GitHubTokenRequest {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri?: string; // ✅ FIX: Optionnel pour éviter les erreurs
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
  
  private readonly timeouts = {
    connect: 5000,    
    request: 180000,    
    response: 90000    
  };

  private readonly httpAgent = new HttpAgent({
    keepAlive: false,           
    timeout: this.timeouts.connect,
    maxSockets: 5,
    maxFreeSockets: 2,
  });

  private readonly httpsAgent = new HttpsAgent({
    keepAlive: false,           
    timeout: this.timeouts.connect,
    maxSockets: 5,
    maxFreeSockets: 2,
    secureProtocol: 'TLSv1_2_method', 
    rejectUnauthorized: true,
  });
  
  constructor(private readonly config: GitHubOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('GitHub OAuth configuration is incomplete');
    }
    
    console.log('🔧 [GITHUB-PROVIDER] Initialized with config:', {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      tokenUrl: config.tokenUrl,
      scopes: config.scopes
    });
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

    const authUrl = `${this.config.authUrl}?${params.toString()}`;
    console.log(`🔐 [GITHUB-PROVIDER] Generated auth URL: ${authUrl}`);
    return authUrl;
  }

  async exchangeCodeForToken(code: string, state?: string): Promise<OAuthTokenResponse> {
    console.log('🔄 [GITHUB-PROVIDER] Starting token exchange...');
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 [GITHUB-PROVIDER] Token exchange attempt ${attempt}/${this.maxRetries}`);
        
        const tokenResponse = await this.makeTokenRequest(code, attempt);
        
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
        
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // ✅ FIX: Backoff exponentiel
        console.log(`⏳ [GITHUB-PROVIDER] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log('❌ [GITHUB-PROVIDER] Token exchange failed after all attempts:', lastError?.message);
    throw new Error(`GitHub OAuth error: ${lastError?.message || 'Unknown error'}`);
  }

  
  private async makeTokenRequest(code: string, attempt: number): Promise<OAuthTokenResponse> {
    console.log(`🔄 [GITHUB-PROVIDER] Making request to GitHub token endpoint (attempt ${attempt})...`);
    console.log(`🌐 [GITHUB-PROVIDER] Your network latency: ~400ms, adapting timeouts accordingly`);
    
    const requestData: GitHubTokenRequest = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri
    };

    console.log('🔍 [GITHUB-PROVIDER] Request data:', {
      client_id: requestData.client_id,
      redirect_uri: requestData.redirect_uri,
      code: `${code.substring(0, 10)}...`,
      tokenUrl: this.config.tokenUrl
    });

    const baseTimeout = 30000; 
    const timeoutMs = baseTimeout + (attempt * 30000); 

    const axiosConfig: AxiosRequestConfig = {
      method: 'POST',
      url: this.config.tokenUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'SMP-Auth-Service/2.0.0',
        'Connection': 'close',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'identity', 
        
      },
      data: requestData,
      timeout: timeoutMs,
      maxRedirects: 0,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (status) => status >= 200 && status < 300,
      transformRequest: [function (data) {
        console.log('📤 [GITHUB-PROVIDER] Sending data to GitHub...');
        return JSON.stringify(data);
      }],
      transformResponse: [function (data) {
        console.log('📥 [GITHUB-PROVIDER] Received response from GitHub');
        try {
          return typeof data === 'string' ? JSON.parse(data) : data;
        } catch (error) {
          console.warn('[GITHUB-PROVIDER] Failed to parse response as JSON:', data);
          return data;
        }
      }],
      proxy:false,
    };

    try {
      console.log(`🔄 [GITHUB-PROVIDER] Sending request with timeout ${timeoutMs}ms...`);
      
      const response = await axios(axiosConfig);
      
      console.log('🔍 [GITHUB-PROVIDER] Raw response:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        dataType: typeof response.data,
        hasAccessToken: !!(response.data && response.data.access_token)
      });
      
      const responseData: GitHubTokenResponse = response.data;
      
      // ✅ FIX 6: Validation de réponse améliorée
      if (responseData.error) {
        const errorMsg = `GitHub API error: ${responseData.error}${responseData.error_description ? ` - ${responseData.error_description}` : ''}`;
        console.error('❌ [GITHUB-PROVIDER] GitHub API returned error:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!responseData.access_token) {
        console.error('❌ [GITHUB-PROVIDER] No access token in response:', responseData);
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
        const axiosError = error as AxiosError;
        
        console.error('❌ [GITHUB-PROVIDER] Axios error details:', {
          message: axiosError.message,
          code: axiosError.code,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          responseData: axiosError.response?.data,
          requestUrl: axiosError.config?.url,
          requestTimeout: axiosError.config?.timeout
        });

        // ✅ FIX 7: Gestion d'erreurs spécifique améliorée
        if (axiosError.code === 'ECONNREFUSED') {
          throw new Error('Connection refused to GitHub API - check network connectivity');
        }
        
        if (axiosError.code === 'ETIMEDOUT') {
          throw new Error(`Request timeout to GitHub API after ${timeoutMs}ms - retrying with longer timeout`);
        }
        
        if (axiosError.code === 'ENOTFOUND') {
          throw new Error('GitHub API endpoint not found - check DNS configuration');
        }
        
        if (axiosError.response?.status === 400) {
          const errorData = axiosError.response.data as any;
          throw new Error(`GitHub API bad request: ${errorData.error || 'Invalid request parameters'}${errorData.error_description ? ` - ${errorData.error_description}` : ''}`);
        }
        
        if (axiosError.response?.status === 401) {
          throw new Error('GitHub OAuth credentials are invalid - check GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET');
        }
        
        // Erreur générique axios
        throw new Error(`Node.js/Axios error: ${axiosError.message} (curl works fine - Node.js specific issue)`);
      }
      
      throw error;
    }
  }

  // ✅ FIX 8: Logique de retry corrigée
  private isRetryableError(error: any): boolean {
  const errorMessage = error?.message || '';
  
  // 🔥 FORCE RETRY pour tous les timeouts
  if (errorMessage.includes('timeout') || 
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('Request timeout')) {
    console.log('✅ [GITHUB-PROVIDER] FORCING RETRY for timeout');
    return true;
  }
  
  // Retry pour erreurs réseau
  const retryKeywords = ['network', 'connection', 'refused', 'reset'];
  for (const keyword of retryKeywords) {
    if (errorMessage.toLowerCase().includes(keyword)) {
      console.log(`✅ [GITHUB-PROVIDER] FORCING RETRY for: ${keyword}`);
      return true;
    }
  }
  
  return false;
}

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      console.log('🔄 [GITHUB-PROVIDER] Fetching user info with optimized Node.js config...');
      
      const userResponse = await axios({
        method: 'GET',
        url: this.config.userInfoUrl,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/2.0.0',
          'Connection': 'close'  // Pas de keep-alive
        },
        timeout: this.timeouts.request,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const userData: GitHubUserResponse = userResponse.data;
      console.log('✅ [GITHUB-PROVIDER] User info retrieved successfully:', { 
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
              'User-Agent': 'SMP-Auth-Service/2.0.0',
              'Connection': 'close'
            },
            timeout: this.timeouts.request,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
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
          'User-Agent': 'SMP-Auth-Service/2.0.0'
        },
        timeout: this.timeouts.request
      });
      
      console.log('✅ [GITHUB-PROVIDER] Token revoked successfully');
      
    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] Token revocation failed:', error);
      throw new Error(`Failed to revoke token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Méthodes utilitaires supplémentaires
  async getUserOrganizations(accessToken: string): Promise<Array<{id: number, login: string, avatar_url: string}>> {
    try {
      const response = await axios({
        method: 'GET',
        url: 'https://api.github.com/user/orgs',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/2.0.0'
        },
        timeout: this.timeouts.request
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
          'User-Agent': 'SMP-Auth-Service/2.0.0'
        },
        params: {
          type,
          per_page: 100,
          sort: 'updated'
        },
        timeout: this.timeouts.request
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