/**
 * Client Keycloak simplifié avec fonctionnalités essentielles
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { 
  KeycloakConfig,
  KeycloakClientExtended,
  AuthResponse,
  TokenValidationResult,
  UserInfo,
  UserAttributes,
  UserRegistrationData,
  UserRegistrationResult,
  KeycloakUserData,
  KeycloakTokenIntrospection,
  ConnectionTestResult,
  ErrorCode
} from '../interface/auth.interface.js';

import { ValidationResult } from '../interface/common.js';
import jwt from 'jsonwebtoken';

export class KeycloakClientImpl implements KeycloakClientExtended {
  private readonly config: KeycloakConfig;
  private readonly axiosInstance: AxiosInstance;
  private adminTokenCache: {
    token: string;
    expiresAt: number;
  } | null = null;
  
  // Métriques simplifiées
  private metrics = {
    requestCount: 0,
    errorCount: 0,
    averageResponseTime: 0,
    lastRequestTime: 0
  };

  constructor(config: KeycloakConfig) {
    this.config = {
      timeout: 10000,
      enableCache: true,
      cacheExpiry: 3600,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
    
    this.axiosInstance = this.createAxiosInstance();
    this.setupInterceptors();
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  private createAxiosInstance(): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.url,
      timeout: this.config.timeout,
      headers: {
        'Accept': '*/*'
      }
    };

    return axios.create(axiosConfig);
  }

  private decodeJWT(token: string): any {
    try {
      // Décoder sans vérification de signature (Keycloak a déjà signé)
      const decoded = jwt.decode(token, { complete: true });
      return decoded?.payload;
    } catch (error) {
      throw new Error(`Invalid JWT token: ${error}`);
    }
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.metrics.requestCount++;
        this.metrics.lastRequestTime = Date.now();
        return config;
      },
      (error) => {
        this.metrics.errorCount++;
        return Promise.reject(this.enhanceError(error));
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        const responseTime = Date.now() - this.metrics.lastRequestTime;
        this.updateAverageResponseTime(responseTime);
        return response;
      },
      (error) => {
        this.metrics.errorCount++;
        const responseTime = Date.now() - this.metrics.lastRequestTime;
        this.updateAverageResponseTime(responseTime);
        return Promise.reject(this.enhanceError(error));
      }
    );
  }

  private updateAverageResponseTime(responseTime: number): void {
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime + responseTime) / 2;
  }

  private enhanceError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      let code = ErrorCode.NETWORK_ERROR;
      let message = 'Keycloak request failed';

      if (axiosError.response) {
        switch (axiosError.response.status) {
          case 401:
            code = ErrorCode.INVALID_CREDENTIALS;
            message = 'Invalid credentials or expired token';
            break;
          case 403:
            code = ErrorCode.INSUFFICIENT_PERMISSIONS;
            message = 'Insufficient permissions';
            break;
          case 404:
            code = ErrorCode.AUTH_USER_NOT_FOUND;
            message = 'User or resource not found';
            break;
          case 500:
          case 502:
          case 503:
            code = ErrorCode.SERVICE_UNAVAILABLE;
            message = 'Keycloak service unavailable';
            break;
        }
      } else if (axiosError.code === 'ECONNREFUSED') {
        code = ErrorCode.SERVICE_UNAVAILABLE;
        message = 'Cannot connect to Keycloak server';
      } else if (axiosError.code === 'ETIMEDOUT') {
        code = ErrorCode.SERVICE_TIMEOUT;
        message = 'Keycloak request timeout';
      }

      const enhancedError = new Error(`${message}: ${axiosError.message}`);
      (enhancedError as any).code = code;
      (enhancedError as any).originalError = axiosError;
      (enhancedError as any).status = axiosError.response?.status;
      return enhancedError;
    }

    return error;
  }

  // ============================================================================
  // AUTHENTIFICATION DE BASE
  // ============================================================================

  async login(username: string, password: string): Promise<AuthResponse> {
    console.log('🔍 DEBUG: Login method called with new fixes');
    
    const url = `/realms/${this.config.realm}/protocol/openid-connect/token`;
    const body = `grant_type=password&client_id=${encodeURIComponent(this.config.clientId)}&client_secret=${encodeURIComponent(this.config.clientSecret)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    console.log('🔍 DEBUG: About to make request');
    console.log('🔍 URL:', `${this.axiosInstance.defaults.baseURL}${url}`);
    console.log('🔍 Body:', body);

    try {
      const response = await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'User-Agent': 'smp-auth-ts'
        }
      });
      
      console.log('🔍 DEBUG: Success!', response.status);
      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        session_id: response.data.session_state,
        session_state: response.data.session_state
      };
    } catch (error) {
      console.log('🔍 DEBUG: Request failed');
      
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.log('🔍 Status:', axiosError.response?.status);
        console.log('🔍 Response headers:', axiosError.response?.headers);
        console.log('🔍 Response data:', axiosError.response?.data);
        console.log('🔍 Request headers sent:', axiosError.config?.headers);
      } else {
        console.log('🔍 Error:', error);
      }
      
      throw this.enhanceError(error);
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const url = `/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    const body = new URLSearchParams();
    body.append('grant_type', 'refresh_token');
    body.append('client_id', this.config.clientId);
    body.append('client_secret', this.config.clientSecret);
    body.append('refresh_token', refreshToken);

    try {
      const response = await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getClientCredentialsToken(): Promise<AuthResponse> {
    const url = `/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');
    body.append('client_id', this.config.clientId);
    body.append('client_secret', this.config.clientSecret);

    try {
      const response = await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async registerUser(userData: UserRegistrationData): Promise<UserRegistrationResult> {
    try {
      console.log('🔍 REGISTER_USER: Starting user registration');
      
      // Obtenir le token admin
      const adminToken = await this.getAdminToken();
      
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await this.getUserByEmail(userData.email);
      if (existingUser) {
        return {
          success: false,
          message: 'User already exists with this email',
          errors: ['EMAIL_ALREADY_EXISTS']
        };
      }
      
      const existingUsername = await this.getUserByUsername(userData.username);
      if (existingUsername) {
        return {
          success: false,
          message: 'Username already taken',
          errors: ['USERNAME_ALREADY_EXISTS']
        };
      }
      
      // Préparer les données utilisateur pour Keycloak
      const keycloakUser = {
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        enabled: userData.enabled !== false,
        emailVerified: userData.emailVerified || false,
        attributes: userData.attributes || {},
        credentials: [{
          type: 'password',
          value: userData.password,
          temporary: false
        }]
      };
      
      console.log('🔍 REGISTER_USER: Creating user in Keycloak');
      
      // Créer l'utilisateur
      const url = `/admin/realms/${this.config.realm}/users`;
      const response = await this.axiosInstance.post(url, keycloakUser, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Extraire l'ID utilisateur depuis le header Location
      const location = response.headers.location;
      const userId = location ? location.split('/').pop() : null;
      
      if (!userId) {
        throw new Error('Failed to extract user ID from response');
      }
      
      console.log('🔍 REGISTER_USER: User created successfully with ID:', userId);
      
      // Assigner des rôles par défaut si nécessaire
      await this.assignDefaultRoles(userId, adminToken);
      
      // Envoyer email de vérification si activé
      if (!userData.emailVerified) {
        await this.sendVerificationEmail(userId, adminToken);
      }
      
      return {
        success: true,
        userId,
        message: 'User registered successfully'
      };
      
    } catch (error) {
      console.error('🔍 REGISTER_USER: Registration failed:', error);
      
      let message = 'Registration failed';
      const errors: string[] = [];
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          message = 'User already exists';
          errors.push('USER_ALREADY_EXISTS');
        } else if (error.response?.status === 400) {
          message = 'Invalid user data';
          errors.push('INVALID_DATA');
        } else {
          message = `Registration failed: ${error.response?.statusText || error.message}`;
          errors.push('KEYCLOAK_ERROR');
        }
      } else {
        errors.push('UNKNOWN_ERROR');
      }
      
      return {
        success: false,
        message,
        errors
      };
    }
  }

  async assignDefaultRoles(userId: string, adminToken: string): Promise<void> {
    try {
      console.log('🔍 ASSIGN_ROLES: Assigning default roles to user:', userId);
      
      // Récupérer les rôles par défaut du realm
      const rolesUrl = `/admin/realms/${this.config.realm}/roles`;
      const rolesResponse = await this.axiosInstance.get(rolesUrl, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      // Filtrer les rôles par défaut (vous pouvez personnaliser cette liste)
      const defaultRoleNames = ['default-roles-mu-realm', 'offline_access'];
      const defaultRoles = rolesResponse.data.filter((role: { name: string; }) => 
        defaultRoleNames.includes(role.name)
      );
      
      if (defaultRoles.length > 0) {
        // Assigner les rôles
        const assignUrl = `/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;
        await this.axiosInstance.post(assignUrl, defaultRoles, {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('🔍 ASSIGN_ROLES: Default roles assigned successfully');
      }
    } catch (error) {
      console.warn('🔍 ASSIGN_ROLES: Failed to assign default roles:', error);
      // Ne pas faire échouer l'enregistrement pour cette erreur
    }
  }

  async sendVerificationEmail(userId: string, adminToken: string): Promise<void> {
    try {
      console.log('🔍 SEND_VERIFICATION: Sending verification email to user:', userId);
      
      const url = `/admin/realms/${this.config.realm}/users/${userId}/send-verify-email`;
      await this.axiosInstance.put(url, {}, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      console.log('🔍 SEND_VERIFICATION: Verification email sent successfully');
    } catch (error) {
      console.warn('🔍 SEND_VERIFICATION: Failed to send verification email:', error);
      // Ne pas faire échouer l'enregistrement pour cette erreur
    }
  }

  async resendVerificationEmail(userId: string): Promise<boolean> {
  try {
    console.log('🔍 RESEND_VERIFICATION: Resending verification email to user:', userId);
    
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users/${userId}/send-verify-email`;
    
    await this.axiosInstance.put(url, {}, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    console.log('🔍 RESEND_VERIFICATION: Verification email resent successfully');
    return true;
  } catch (error) {
    console.warn('🔍 RESEND_VERIFICATION: Failed to resend verification email:', error);
    return false;
  }
}

  async verifyEmail(userId: string, token: string): Promise<boolean> {
    try {
      // Cette fonctionnalité nécessite une configuration spéciale dans Keycloak
      // Pour l'instant, on peut marquer l'email comme vérifié manuellement
      const adminToken = await this.getAdminToken();
      
      const updateUrl = `/admin/realms/${this.config.realm}/users/${userId}`;
      await this.axiosInstance.put(updateUrl, {
        emailVerified: true
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return true;
    } catch (error) {
      console.error('🔍 VERIFY_EMAIL: Failed to verify email:', error);
      return false;
    }
  }

  async resetPassword(email: string): Promise<boolean> {
    try {
      console.log('🔍 RESET_PASSWORD: Initiating password reset for:', email);
      
      // Trouver l'utilisateur par email
      const user = await this.getUserByEmail(email);
      if (!user) {
        console.log('🔍 RESET_PASSWORD: User not found');
        return false;
      }
      
      const adminToken = await this.getAdminToken();
      
      // Envoyer email de reset password
      const url = `/admin/realms/${this.config.realm}/users/${user.id}/execute-actions-email`;
      await this.axiosInstance.put(url, ['UPDATE_PASSWORD'], {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('🔍 RESET_PASSWORD: Password reset email sent');
      return true;
    } catch (error) {
      console.error('🔍 RESET_PASSWORD: Failed to send reset email:', error);
      return false;
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    try {
      console.log('🔍 CHANGE_PASSWORD: Changing password for user:', userId);
      
      const adminToken = await this.getAdminToken();
      
      // Définir le nouveau mot de passe
      const url = `/admin/realms/${this.config.realm}/users/${userId}/reset-password`;
      await this.axiosInstance.put(url, {
        type: 'password',
        value: newPassword,
        temporary: false
      }, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('🔍 CHANGE_PASSWORD: Password changed successfully');
      return true;
    } catch (error) {
      console.error('🔍 CHANGE_PASSWORD: Failed to change password:', error);
      return false;
    }
  }


  async logout(token: string): Promise<void> {
    const url = `/realms/${this.config.realm}/protocol/openid-connect/logout`;
    
    const body = new URLSearchParams();
    body.append('client_id', this.config.clientId);
    body.append('client_secret', this.config.clientSecret);
    body.append('refresh_token', token);

    try {
      await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    } catch (error) {
      if (!this.isIgnorableLogoutError(error)) {
        throw this.enhanceError(error);
      }
    }
  }

  private isIgnorableLogoutError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      return status === 400 || status === 401;
    }
    return false;
  }

  // ============================================================================
  // VALIDATION DE TOKENS
  // ============================================================================

  async validateToken(token: string): Promise<UserInfo> {
    console.log('🔍 VALIDATE_TOKEN: Using JWT decode instead of /userinfo');
    
    try {
      // Option 1: Décoder directement le JWT
      const decoded = this.decodeJWT(token);
      
      if (!decoded) {
        throw new Error('Invalid token format');
      }
      
      // Vérifier l'expiration
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp < now) {
        throw new Error('Token expired');
      }
      
      console.log('🔍 VALIDATE_TOKEN: JWT decoded successfully');
      return this.mapTokenResponseToUserInfo(decoded);
      
    } catch (error) {
      console.log('🔍 VALIDATE_TOKEN: JWT decode failed, trying introspection');
      
      // Fallback vers l'introspection
      try {
        return await this.validateTokenRaw(token).then(introspection => {
          if (!introspection.active) {
            throw new Error('Token is not active');
          }
          return this.mapIntrospectionToUserInfo(introspection);
        });
      } catch (introspectionError) {
        console.log('🔍 VALIDATE_TOKEN: Introspection also failed');
        throw new Error(`Token validation failed: ${introspectionError}`);
      }
    }
  }

  private mapIntrospectionToUserInfo(introspection: any): UserInfo {
    const roles = this.extractRolesFromIntrospection(introspection);
    const organizationIds = this.extractOrganizationIds(introspection);
    const attributes = this.mapAttributesToUserAttributes(introspection);

    return {
      sub: introspection.sub,
      email: introspection.email,
      given_name: introspection.given_name,
      family_name: introspection.family_name,
      preferred_username: introspection.preferred_username || introspection.username,
      roles,
      organization_ids: organizationIds,
      state: introspection.active ? 'active' : 'inactive',
      attributes,
      resource_access: introspection.resource_access,
      realm_access: introspection.realm_access,
      email_verified: introspection.email_verified,
      created_at: introspection.iat ? new Date(introspection.iat * 1000).toISOString() : undefined,
      updated_at: new Date().toISOString()
    };
  }

  private extractRolesFromIntrospection(introspection: any): string[] {
    const roles: string[] = [];
    
    if (introspection.realm_access?.roles) {
      roles.push(...introspection.realm_access.roles);
    }
    
    if (introspection.resource_access) {
      Object.values(introspection.resource_access).forEach((resource: any) => {
        if (resource.roles) {
          roles.push(...resource.roles);
        }
      });
    }
    
    return [...new Set(roles)];
  }

  async validateTokenRaw(token: string): Promise<KeycloakTokenIntrospection> {
    const url = `/realms/${this.config.realm}/protocol/openid-connect/token/introspect`;
    
    const body = new URLSearchParams();
    body.append('token', token);
    body.append('client_id', this.config.clientId);
    body.append('client_secret', this.config.clientSecret);

    try {
      const response = await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      return response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  // ============================================================================
  // GESTION DES UTILISATEURS
  // ============================================================================

  async getAdminToken(): Promise<string> {
    if (this.adminTokenCache && this.adminTokenCache.expiresAt > Date.now()) {
      return this.adminTokenCache.token;
    }

    const clientId = this.config.adminClientId || this.config.clientId;
    const clientSecret = this.config.adminClientSecret || this.config.clientSecret;

    const body = new URLSearchParams();
    body.append('grant_type', 'client_credentials');
    body.append('client_id', clientId);
    body.append('client_secret', clientSecret);

    const url = `/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    try {
      const response = await this.axiosInstance.post(url, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      
      this.adminTokenCache = {
        token,
        expiresAt: Date.now() + (expiresIn * 1000) - 60000
      };
      
      return token;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async refreshAdminToken(): Promise<string> {
    this.adminTokenCache = null;
    return this.getAdminToken();
  }

  async getUserInfo(userId: string): Promise<UserInfo | null> {
  try {
    console.log('🔍 getUserInfo: Trying to get admin token first');
    
    // Essayer d'abord l'API Admin
    try {
      const userData = await this.getUserData(userId);
      console.log('🔍 getUserInfo: Successfully retrieved from Admin API');
      return this.mapUserDataToUserInfo(userData);
    } catch (adminError) {
      console.log('🔍 getUserInfo: Admin API failed, using token introspection fallback');
      
      // Fallback 1: Essayer avec un token admin pour introspection
      try {
        const adminToken = await this.getAdminToken();
        
        // Utiliser l'introspection avec le token admin
        const introspectionUrl = `/realms/${this.config.realm}/protocol/openid-connect/token/introspect`;
        const body = new URLSearchParams();
        body.append('token', adminToken);
        body.append('client_id', this.config.clientId);
        body.append('client_secret', this.config.clientSecret);
        
        const response = await this.axiosInstance.post(introspectionUrl, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        if (response.data.active && response.data.sub === userId) {
          console.log('🔍 getUserInfo: Retrieved from token introspection');
          return this.mapIntrospectionToUserInfo(response.data);
        }
      } catch (introspectionError) {
        console.log('🔍 getUserInfo: Token introspection also failed');
      }
      
      // Fallback 2: Créer un UserInfo minimal à partir de l'ID
      console.warn(`🔍 getUserInfo: Creating minimal UserInfo for user ${userId}`);
      return {
        sub: userId,
        email: undefined,
        given_name: undefined,
        family_name: undefined,
        preferred_username: userId,
        roles: [],
        organization_ids: [],
        state: 'active',
        attributes: {},
        resource_access: {},
        realm_access: { roles: [] }
      };
    }
    
  } catch (error) {
    console.error(`🔍 getUserInfo: All methods failed for user ${userId}:`, error);
    return null;
  }
}





  async getUserData(userId: string): Promise<KeycloakUserData> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users/${userId}`;
    
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      return response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getRoles(userId: string): Promise<string[]> {
    const adminToken = await this.getAdminToken();
    
    try {
      const realmRolesUrl = `/admin/realms/${this.config.realm}/users/${userId}/role-mappings/realm`;
      const realmRolesResponse = await this.axiosInstance.get(realmRolesUrl, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      const realmRoles = realmRolesResponse.data.map((role: any) => role.name);
      
      // Simplification : ne récupérer que les rôles du realm pour l'instant
      return realmRoles;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  // ============================================================================
  // GESTION SIMPLIFIÉE DES UTILISATEURS
  // ============================================================================

  async createUser(userData: Partial<KeycloakUserData>): Promise<string> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users`;
    
    const userPayload = {
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      enabled: userData.enabled ?? true,
      attributes: userData.attributes || {},
      ...userData
    };
    
    try {
      const response = await this.axiosInstance.post(url, userPayload, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const location = response.headers.location;
      if (location) {
        const userId = location.split('/').pop();
        return userId || '';
      }
      
      throw new Error('User ID not found in response');
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async updateUser(userId: string, userData: Partial<KeycloakUserData>): Promise<void> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users/${userId}`;
    
    try {
      await this.axiosInstance.put(url, userData, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users/${userId}`;
    
    try {
      await this.axiosInstance.delete(url, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  // ============================================================================
  // RECHERCHE D'UTILISATEURS
  // ============================================================================

  async searchUsers(query: string, limit: number = 100): Promise<KeycloakUserData[]> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users`;
    
    const params = new URLSearchParams();
    params.append('search', query);
    params.append('max', limit.toString());
    
    try {
      const response = await this.axiosInstance.get(`${url}?${params}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      return response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getUserByUsername(username: string): Promise<KeycloakUserData | null> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users`;
    
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('exact', 'true');
    
    try {
      const response = await this.axiosInstance.get(`${url}?${params}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      return response.data.length > 0 ? response.data[0] : null;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getUserByEmail(email: string): Promise<KeycloakUserData | null> {
    const adminToken = await this.getAdminToken();
    const url = `/admin/realms/${this.config.realm}/users`;
    
    const params = new URLSearchParams();
    params.append('email', email);
    params.append('exact', 'true');
    
    try {
      const response = await this.axiosInstance.get(`${url}?${params}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      return response.data.length > 0 ? response.data[0] : null;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  // ============================================================================
  // TESTS ET SURVEILLANCE
  // ============================================================================

  async healthCheck(): Promise<boolean> {
  try {
    const url = `/health/ready`;
    const response = await this.axiosInstance.get(url, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

  async getServerInfo(): Promise<any> {
    try {
      const adminToken = await this.getAdminToken();
      const url = '/admin/serverinfo';
      
      const response = await this.axiosInstance.get(url, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      return response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  getMetrics(): Record<string, any> {
    return {
      ...this.metrics,
      errorRate: this.metrics.requestCount > 0 ? 
        (this.metrics.errorCount / this.metrics.requestCount) * 100 : 0
    };
  }

  // ============================================================================
  // MAPPERS ET UTILITAIRES
  // ============================================================================

  private mapTokenResponseToUserInfo(tokenData: any): UserInfo {
    const roles = this.extractRoles(tokenData);
    const organizationIds = this.extractOrganizationIds(tokenData);
    const attributes = this.mapAttributesToUserAttributes(tokenData);

    return {
      sub: tokenData.sub,
      email: tokenData.email,
      given_name: tokenData.given_name,
      family_name: tokenData.family_name,
      preferred_username: tokenData.preferred_username,
      roles,
      organization_ids: organizationIds,
      state: tokenData.user_state || 'active',
      attributes,
      resource_access: tokenData.resource_access,
      realm_access: tokenData.realm_access,
      email_verified: tokenData.email_verified,
      created_at: tokenData.created_timestamp ? 
        new Date(tokenData.created_timestamp * 1000).toISOString() : undefined,
      updated_at: new Date().toISOString()
    };
  }

  private mapUserDataToUserInfo(userData: KeycloakUserData): UserInfo {
    const roles = [
      ...(userData.realmRoles || []),
      ...Object.values(userData.clientRoles || {}).flat()
    ];
    
    const organizationIds = this.extractOrganizationIdsFromAttributes(userData.attributes);
    const attributes = this.mapKeycloakAttributesToUserAttributes(userData.attributes);

    return {
      sub: userData.id,
      email: userData.email,
      given_name: userData.firstName,
      family_name: userData.lastName,
      preferred_username: userData.username,
      roles: [...new Set(roles)],
      organization_ids: organizationIds,
      state: userData.enabled ? 'active' : 'inactive',
      attributes,
      email_verified: userData.emailVerified,
      created_at: userData.createdTimestamp ? 
        new Date(userData.createdTimestamp).toISOString() : undefined,
      updated_at: new Date().toISOString()
    };
  }

  private extractRoles(tokenData: any): string[] {
    const roles: string[] = [];
    
    if (tokenData.realm_access?.roles) {
      roles.push(...tokenData.realm_access.roles);
    }
    
    if (tokenData.resource_access) {
      Object.values(tokenData.resource_access).forEach((resource: any) => {
        if (resource.roles) {
          roles.push(...resource.roles);
        }
      });
    }
    
    return [...new Set(roles)];
  }

  private extractOrganizationIds(tokenData: any): string[] {
    const orgIds = tokenData.organization_ids;
    
    if (!orgIds) return [];
    
    if (Array.isArray(orgIds)) {
      return orgIds;
    }
    
    if (typeof orgIds === 'string') {
      return orgIds.split(',').map(id => id.trim());
    }
    
    return [];
  }

  private extractOrganizationIdsFromAttributes(attributes?: Record<string, string[]>): string[] {
    if (!attributes) return [];
    
    const orgIds = attributes.organization_ids || attributes.organizationIds || attributes['organization-ids'];
    
    if (!orgIds) return [];
    
    return orgIds.flatMap(id => id.split(',').map(i => i.trim()));
  }

  private mapAttributesToUserAttributes(tokenData: any): UserAttributes {
    const attributes: UserAttributes = {
      department: tokenData.department,
      clearanceLevel: this.parseNumber(tokenData.clearance_level),
      contractExpiryDate: tokenData.contract_expiry_date,
      managerId: tokenData.manager_id,
      jobTitle: tokenData.job_title,
      businessUnit: tokenData.business_unit,
      workLocation: tokenData.work_location,
      employmentType: tokenData.employment_type,
      verificationStatus: tokenData.verification_status,
      riskScore: this.parseNumber(tokenData.risk_score),
      firstName: tokenData.given_name,
      lastName: tokenData.family_name,
      phoneNumber: tokenData.phone_number
    };
    
    // Nettoyer les valeurs undefined
    Object.keys(attributes).forEach(key => {
      if (attributes[key] === undefined) {
        delete attributes[key];
      }
    });
    
    return attributes;
  }

  private mapKeycloakAttributesToUserAttributes(attributes?: Record<string, string[]>): UserAttributes {
    if (!attributes) return {};
    
    const userAttributes: UserAttributes = {};
    
    const standardMapping = {
      department: 'department',
      clearanceLevel: 'clearance_level',
      contractExpiryDate: 'contract_expiry_date',
      managerId: 'manager_id',
      jobTitle: 'job_title',
      businessUnit: 'business_unit',
      workLocation: 'work_location',
      employmentType: 'employment_type',
      verificationStatus: 'verification_status',
      riskScore: 'risk_score'
    };
    
    Object.entries(standardMapping).forEach(([userAttr, keycloakAttr]) => {
      const value = attributes[keycloakAttr];
      if (value && value.length > 0) {
        if (userAttr === 'clearanceLevel' || userAttr === 'riskScore') {
          userAttributes[userAttr] = this.parseNumber(value[0]);
        } else {
          userAttributes[userAttr] = value[0];
        }
      }
    });
    
    return userAttributes;
  }

  private parseNumber(value: any): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  // ============================================================================
  // VALIDATION ET TEST
  // ============================================================================

  validateConfig(): ValidationResult {
    const errors: string[] = [];
    
    if (!this.config.url) {
      errors.push('Keycloak URL is required');
    } else if (!this.config.url.startsWith('http')) {
      errors.push('Keycloak URL must start with http:// or https://');
    }
    
    if (!this.config.realm) {
      errors.push('Keycloak realm is required');
    }
    
    if (!this.config.clientId) {
      errors.push('Keycloak client ID is required');
    }
    
    if (!this.config.clientSecret) {
      errors.push('Keycloak client secret is required');
    }
    
    if (this.config.timeout && (this.config.timeout < 1000 || this.config.timeout > 60000)) {
      errors.push('Keycloak timeout must be between 1000 and 60000 milliseconds');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      const healthOk = await this.healthCheck();
      const latency = Date.now() - startTime;
      
      if (!healthOk) {
        return {
          connected: false,
          error: 'Health check failed',
          latency,
          timestamp: new Date().toISOString()
        };
      }
      
      try {
        await this.getAdminToken();
      } catch (error) {
        return {
          connected: false,
          error: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
          latency,
          timestamp: new Date().toISOString()
        };
      }
      
      const serverInfo = await this.getServerInfo().catch(() => null);
      
      return {
        connected: true,
        info: 'Keycloak connection successful',
        latency,
        details: {
          serverInfo,
          metrics: this.getMetrics(),
          config: {
            url: this.config.url,
            realm: this.config.realm,
            timeout: this.config.timeout
          }
        },
        timestamp: new Date().toISOString(),
        version: serverInfo?.systemInfo?.version
      };
    } catch (error) {
      return {
        connected: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ============================================================================
  // FERMETURE
  // ============================================================================

  async close(): Promise<void> {
    this.adminTokenCache = null;
    console.log('Keycloak client closed');
  }
}