import axios from 'axios';
import { KeycloakConfig } from '../interface/keycloak.interface.js';
import { UserInfo } from '../interface/auth.interface.js';
export class KeycloakClientImpl {
  private config: KeycloakConfig;
  
  constructor(config: KeycloakConfig) {
    this.config = config;
  }

  /**
   * Récupère un token administrateur avec client_credentials
   */
  async getAdminToken(): Promise<string> {
    // Utiliser le body JSON au lieu de URLSearchParams
    const body = {
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    };
    
    const url = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/token`;
    
    try {
      const response = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout || 5000
      });
      
      return response.data.access_token;
    } catch (error) {
      console.error('Error fetching admin token:', error);
      throw error;
    }
  }
  
  /**
   * Valide un token et retourne les informations utilisateur
   */
  async validateToken(token: string): Promise<UserInfo> {
    const url = `${this.config.url}/realms/${this.config.realm}/protocol/openid-connect/userinfo`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout: this.config.timeout || 5000
      });
      
      // Extraire les informations utilisateur de la réponse
      const userInfo: UserInfo = {
        sub: response.data.sub,
        email: response.data.email,
        given_name: response.data.given_name,
        family_name: response.data.family_name,
        roles: this.extractRoles(response.data),
        attributes: response.data.attributes || {},
        resource_access: response.data.resource_access,
        organization_ids: this.extractOrganizationIds(response.data)
      };
      
      return userInfo;
    } catch (error) {
      console.error('Error validating token:', error);
      throw error;
    }
  }
  
  /**
   * Récupère les rôles d'un utilisateur
   */
  async getRoles(userId: string): Promise<string[]> {
    const adminToken = await this.getAdminToken();
    
    const url = `${this.config.url}/admin/realms/${this.config.realm}/users/${userId}/role-mappings`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${adminToken}`
        },
        timeout: this.config.timeout || 5000
      });
      
      // Extraire les noms des rôles
      return response.data.map((role: any) => role.name);
    } catch (error) {
      console.error('Error fetching user roles:', error);
      throw error;
    }
  }
  
  /**
   * Récupère les informations d'un utilisateur
   */
  async getUserInfo(userId: string): Promise<UserInfo> {
    const adminToken = await this.getAdminToken();
    
    const url = `${this.config.url}/admin/realms/${this.config.realm}/users/${userId}`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${adminToken}`
        },
        timeout: this.config.timeout || 5000
      });
      
      const roles = await this.getRoles(userId);
      
      const userInfo: UserInfo = {
        sub: response.data.id,
        email: response.data.email,
        given_name: response.data.firstName,
        family_name: response.data.lastName,
        roles: roles,
        attributes: response.data.attributes || {},
        organization_ids: this.extractOrganizationIds(response.data)
      };
      
      return userInfo;
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  }
  
  /**
   * Méthode privée pour extraire les rôles
   */
  private extractRoles(userData: any): string[] {
    const roles: string[] = [];
    
    // Récupérer les rôles du realm
    if (userData.realm_access && Array.isArray(userData.realm_access.roles)) {
      roles.push(...userData.realm_access.roles);
    }
    
    // Récupérer les rôles des ressources
    if (userData.resource_access) {
      Object.values(userData.resource_access).forEach((resource: any) => {
        if (resource.roles && Array.isArray(resource.roles)) {
          roles.push(...resource.roles);
        }
      });
    }
    
    return [...new Set(roles)]; // Éliminer les doublons
  }
  
  /**
   * Méthode privée pour extraire les IDs d'organisation
   */
  private extractOrganizationIds(userData: any): string[] {
    if (userData.attributes && userData.attributes.organization_ids) {
      return Array.isArray(userData.attributes.organization_ids)
        ? userData.attributes.organization_ids
        : [userData.attributes.organization_ids];
    }
    return [];
  }
}