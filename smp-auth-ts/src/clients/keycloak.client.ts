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
  KeycloakUserData,
  KeycloakTokenIntrospection,
  ConnectionTestResult,
  ErrorCode
} from '../interface/auth.interface.js';

import { ValidationResult } from '../interface/common.js';

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
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return axios.create(axiosConfig);
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
    const url = `/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    const body = new URLSearchParams();
    body.append('grant_type', 'password');
    body.append('client_id', this.config.clientId);
    body.append('client_secret', this.config.clientSecret);
    body.append('username', username);
    body.append('password', password);

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
        scope: response.data.scope,
        session_id: response.data.session_state,
        session_state: response.data.session_state
      };
    } catch (error) {
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
    const url = `/realms/${this.config.realm}/protocol/openid-connect/userinfo`;
    
    try {
      const response = await this.axiosInstance.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      return this.mapTokenResponseToUserInfo(response.data);
    } catch (error) {
      throw this.enhanceError(error);
    }
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

  async getUserInfo(userId: string): Promise<UserInfo> {
    const userData = await this.getUserData(userId);
    return this.mapUserDataToUserInfo(userData);
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
      const url = `/realms/${this.config.realm}/.well-known/openid_configuration`;
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