// smp-auth-ts/src/providers/oauth/github.provider.ts - VERSION AVEC NODE.JS NATIF
import { 
  OAuthProvider, 
  OAuthTokenResponse, 
  OAuthUserInfo 
} from '../../interface/oauth.interface.js';
import { GitHubOAuthConfig } from '../../config/oauth.config.js';
import * as https from 'https';
import axios from 'axios';

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
  
  constructor(private readonly config: GitHubOAuthConfig) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('GitHub OAuth configuration is incomplete');
    }
    
    console.log('🔧 [GITHUB-PROVIDER] Initialized with Node.js native HTTPS fallback');
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
    console.log('🔄 [GITHUB-PROVIDER] Starting token exchange with native Node.js...');
    
    // 🔥 SOLUTION IMMÉDIATE: Utiliser Node.js natif directement
    try {
      const result = await this.makeTokenRequestNative(code);
      console.log('✅ [GITHUB-PROVIDER] Native Node.js token exchange successful');
      return result;
    } catch (nativeError) {
      console.warn('⚠️ [GITHUB-PROVIDER] Native failed, trying Axios as fallback:');
      
      // Fallback vers Axios ultra-simple
      try {
        return await this.makeTokenRequestAxios(code);
      } catch (axiosError) {
        console.error('❌ [GITHUB-PROVIDER] Both native and Axios failed');
        throw new Error(`GitHub OAuth failed: Native: , Axios: `);
      }
    }
  }

  // 🔥 MÉTHODE PRINCIPALE: Node.js natif (comme curl)
  private async makeTokenRequestNative(code: string): Promise<OAuthTokenResponse> {
    return new Promise((resolve, reject) => {
      const requestData = {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        redirect_uri: this.config.redirectUri
      };
      
      const data = JSON.stringify(requestData);
      const startTime = Date.now();
      
      const options = {
        hostname: 'github.com',
        port: 443,
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json', 
          'User-Agent': 'SMP-Auth-Service/2.0.0',
          'Content-Length': Buffer.byteLength(data)
        },
        // 🔥 Configuration réseau optimisée
        family: 4, // Force IPv4 comme curl
        timeout: 15000
      };
      
      console.log('🔄 [GITHUB-PROVIDER] Using native Node.js HTTPS request...');
      console.log('🔍 [GITHUB-PROVIDER] Request details:', {
        hostname: options.hostname,
        path: options.path,
        method: options.method,
        contentType: options.headers['Content-Type'],
        dataLength: data.length,
        timeout: options.timeout
      });
      
      const req = https.request(options, (res) => {
        const duration = Date.now() - startTime;
        console.log('📡 [GITHUB-PROVIDER] Response received:', {
          status: res.statusCode,
          statusMessage: res.statusMessage,
          contentType: res.headers['content-type'],
          duration: duration + 'ms'
        });
        
        let body = '';
        let receivedBytes = 0;
        
        res.on('data', (chunk) => {
          body += chunk;
          receivedBytes += chunk.length;
          console.log('📥 [GITHUB-PROVIDER] Received chunk:', chunk.length, 'bytes, total:', receivedBytes);
        });
        
        res.on('end', () => {
          const totalDuration = Date.now() - startTime;
          console.log('✅ [GITHUB-PROVIDER] Request completed in', totalDuration + 'ms');
          
          try {
            const responseData: GitHubTokenResponse = JSON.parse(body);
            console.log('🔍 [GITHUB-PROVIDER] Parsed response:', {
              hasAccessToken: !!responseData.access_token,
              tokenType: responseData.token_type,
              scope: responseData.scope,
              hasError: !!responseData.error
            });
            
            if (responseData.error) {
              reject(new Error(`GitHub API error: ${responseData.error}${responseData.error_description ? ` - ${responseData.error_description}` : ''}`));
              return;
            }
            
            if (!responseData.access_token) {
              reject(new Error('No access token received from GitHub'));
              return;
            }
            
            resolve({
              access_token: responseData.access_token,
              token_type: responseData.token_type || 'bearer',
              expires_in: responseData.expires_in || 28800,
              refresh_token: responseData.refresh_token,
              scope: responseData.scope
            });
            
          } catch (parseError) {
            console.error('❌ [GITHUB-PROVIDER] Failed to parse response:', parseError);
            console.error('📄 [GITHUB-PROVIDER] Raw response body:', body);
            reject(new Error(`Failed to parse GitHub response: `));
          }
        });
      });
      
      // 🔥 Gestion des timeouts et erreurs
      req.setTimeout(15000, () => {
        const duration = Date.now() - startTime;
        console.log('❌ [GITHUB-PROVIDER] Request timeout after', duration + 'ms');
        req.destroy();
        reject(new Error(`Native HTTPS request timeout after ${duration}ms`));
      });
      
      req.on('error', (err) => {
        const duration = Date.now() - startTime;
        console.log('❌ [GITHUB-PROVIDER] Request error after', duration + 'ms:', {
          message: err.message,
          code: (err as any).code,
          syscall: (err as any).syscall,
          hostname: (err as any).hostname,
          port: (err as any).port
        });
        
        reject(new Error(`Native HTTPS error: ${err.message} (code: ${(err as any).code})`));
      });
      
      // 🔥 Envoi des données
      console.log('📤 [GITHUB-PROVIDER] Sending request data...');
      req.write(data);
      req.end();
    });
  }

  // 🔥 MÉTHODE FALLBACK: Axios ultra-simple
  private async makeTokenRequestAxios(code: string): Promise<OAuthTokenResponse> {
    console.log('🔄 [GITHUB-PROVIDER] Trying Axios fallback with ultra-simple config...');
    
    const requestData = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code: code,
      redirect_uri: this.config.redirectUri
    };

    try {
      const response = await axios({
        method: 'POST',
        url: this.config.tokenUrl,
        data: requestData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'SMP-Auth-Service/2.0.0',
        },
        timeout: 15000,
        // 🔥 Configuration ultra-simple
        maxRedirects: 0,
        proxy: false,
        httpAgent: false,
        httpsAgent: false,
        family: 4, // Force IPv4
      });
      
      const responseData: GitHubTokenResponse = response.data;
      
      if (responseData.error) {
        throw new Error(`GitHub API error: ${responseData.error}`);
      }

      if (!responseData.access_token) {
        throw new Error('No access token received from GitHub');
      }

      return {
        access_token: responseData.access_token,
        token_type: responseData.token_type || 'bearer',
        expires_in: responseData.expires_in || 28800,
        refresh_token: responseData.refresh_token,
        scope: responseData.scope
      };

    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] Axios fallback failed:');
      throw error;
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      console.log('🔄 [GITHUB-PROVIDER] Fetching user info...');
      
      const userResponse = await axios({
        method: 'GET',
        url: this.config.userInfoUrl,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/2.0.0',
        },
        timeout: 15000,
        proxy: false,
        family: 4,
      });

      const userData: GitHubUserResponse = userResponse.data;
      console.log('✅ [GITHUB-PROVIDER] User info retrieved:', { 
        id: userData.id, 
        login: userData.login,
        email: userData.email 
      });

      // Récupérer les emails si nécessaire
      let email = userData.email;
      let verified = false;

      if (!email) {
        try {
          const emailsResponse = await axios({
            method: 'GET',
            url: 'https://api.github.com/user/emails',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'SMP-Auth-Service/2.0.0',
            },
            timeout: 15000,
            proxy: false,
            family: 4,
          });

          const emails: GitHubEmailResponse[] = emailsResponse.data;
          const primaryEmail = emails.find(e => e.primary && e.verified);
          if (primaryEmail) {
            email = primaryEmail.email;
            verified = primaryEmail.verified;
          }
        } catch (emailError) {
          console.warn('⚠️ [GITHUB-PROVIDER] Failed to fetch emails:');
        }
      }

      if (!email) {
        throw new Error('No email address found for GitHub user');
      }

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
        raw: userData
      };

    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] User info failed:');
      throw new Error(`Failed to get user info:`);
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    throw new Error('GitHub OAuth Apps do not support token refresh');
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await axios({
        method: 'DELETE',
        url: `https://api.github.com/applications/${this.config.clientId}/grant`,
        auth: {
          username: this.config.clientId,
          password: this.config.clientSecret
        },
        data: { access_token: token },
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'SMP-Auth-Service/2.0.0'
        },
        timeout: 15000,
        proxy: false,
        family: 4,
      });
      
      console.log('✅ [GITHUB-PROVIDER] Token revoked successfully');
    } catch (error) {
      console.error('❌ [GITHUB-PROVIDER] Token revocation failed:');
      throw error;
    }
  }
}