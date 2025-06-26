// Dans mu-auth/src/services/auth.service.ts
import { KeycloakClientImpl } from 'smp-auth-ts';
import { KeycloakConfig } from 'smp-auth-ts';
import {  UserInfo } from 'smp-auth-ts';

export class AuthService {
  private keycloakClient: KeycloakClientImpl;
  
  constructor(config: KeycloakConfig) {
    this.keycloakClient = new KeycloakClientImpl(config);
  }
  
  /**
   * Valide un token d'accès
   */
  async validateToken(token: string): Promise<UserInfo> {
    try {
      return await this.keycloakClient.validateToken(token);
    } catch (error) {
      console.error('Error validating token:', error);
      throw error;
    }
  }
  
  /**
   * Récupère les informations d'un utilisateur
   */
  async getUserInfo(userId: string): Promise<UserInfo | null> {
    try {
      return await this.keycloakClient.getUserInfo(userId);
    } catch (error) {
      console.error('Error getting user info:', error);
      throw error;
    }
  }
  
  /**
   * Récupère les rôles d'un utilisateur
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      return await this.keycloakClient.getRoles(userId);
    } catch (error) {
      console.error('Error getting user roles:', error);
      throw error;
    }
  }
  
  /**
   * Récupère un token administrateur
   */
  async getAdminToken(): Promise<string> {
    try {
      return await this.keycloakClient.getAdminToken();
    } catch (error) {
      console.error('Error getting admin token:', error);
      throw error;
    }
  }
}