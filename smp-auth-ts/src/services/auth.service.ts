import { createHash } from 'crypto';
import { AuthConfig } from '../interface/common.js';
import { KeycloakClient } from '../interface/keycloak.interface.js';
import { OPAClient, OPAInput, OPAResult } from '../interface/opa.interface.js';
import { RedisClient } from '../interface/redis.interface.js';
import { KeycloakClientImpl } from '../clients/keycloak.client.js';
import { OPAClientImpl } from '../clients/opa.client.js';
import { RedisClientImpl } from '../clients/redis.client.js';
import { loadConfig } from '../config.js';

/**
 * Service principal d'authentification et d'autorisation
 */
export class AuthService {
  private config: AuthConfig;
  private keycloak: KeycloakClient;
  private opa: OPAClient;
  private redis: RedisClient;
  
  /**
   * Crée une nouvelle instance du service d'authentification
   */
  constructor(config?: AuthConfig) {
    this.config = config || loadConfig();
    this.keycloak = new KeycloakClientImpl(this.config.keycloak);
    this.opa = new OPAClientImpl(this.config.opa);
    this.redis = new RedisClientImpl(this.config.redis);
  }
  
  getKeycloakClient(): KeycloakClient {
    return this.keycloak;
  }
  
  getOPAClient(): OPAClient {
    return this.opa;
  }
  
  getRedisClient(): RedisClient {
    return this.redis;
  }
  
  private buildCacheKey(userId: string, resourceId: string, resourceType: string, action: string): string {
    const data = { userId, resourceId, resourceType, action };
    return `auth:${createHash('md5').update(JSON.stringify(data)).digest('hex')}`;
  }
  
  async checkPermission(
    token: string, 
    resourceId: string, 
    resourceType: string, 
    action: string,
    cacheResults: boolean = true,
    ttl: number = 300
  ): Promise<boolean> {
    try {
      // Valider le token et récupérer les informations utilisateur
      const userInfo = await this.keycloak.validateToken(token);
      
      // Vérifier le cache si activé
      if (cacheResults) {
        const cacheKey = this.buildCacheKey(userInfo.sub, resourceId, resourceType, action);
        const cachedResult = await this.redis.get(cacheKey);
        
        if (cachedResult !== null) {
          return cachedResult === 'true';
        }
      }
      
      // Construire l'input pour OPA
      const input: OPAInput = {
        user: {
          id: userInfo.sub,
          roles: userInfo.roles,
          attributes: userInfo.attributes,
          organization_ids: userInfo.organization_ids,
        },
        resource: {
          id: resourceId,
          type: resourceType,
          attributes: {}, // À compléter avec les attributs de ressource si disponibles
        },
        action,
      };
      
      // Évaluer avec OPA
      const result = await this.opa.checkPermission(input);
      
      // Mettre en cache si activé
      if (cacheResults) {
        const cacheKey = this.buildCacheKey(userInfo.sub, resourceId, resourceType, action);
        await this.redis.set(cacheKey, result.allow.toString(), ttl);
      }
      
      return result.allow;
    } catch (error) {
      console.error('Erreur lors de la vérification d\'autorisation:', error);
      // En cas d'erreur, on refuse par sécurité
      return false;
    }
  }

  /**
 * Journalise une décision d'autorisation
 */
async logAuthorizationDecision(
  userId: string,
  resourceId: string,
  resourceType: string,
  action: string,
  allowed: boolean,
  reason?: string,
  context?: Record<string, any>
): Promise<void> {
  try {
    await this.redis.logAuthorizationDecision(
      userId,
      resourceId,
      resourceType,
      action,
      allowed,
      reason,
      context
    );
  } catch (error) {
    console.error('Erreur lors de la journalisation de la décision:', error);
  }
}

/**
 * Récupère l'historique des décisions d'autorisation
 */
async getAuthorizationHistory(
  userId?: string,
  resourceId?: string,
  limit?: number,
  offset?: number
): Promise<Array<Record<string, any>>> {
  return this.redis.getAuthorizationHistory(userId, resourceId, limit, offset);
}
  
  /**
   * Évalue directement une politique avec des données d'entrée personnalisées
   * @param input Données d'entrée pour l'évaluation de politique
   */
  async evaluatePolicy(input: OPAInput): Promise<OPAResult> {
    return this.opa.checkPermission(input);
  }
  
  /**
   * Invalide le cache d'autorisation pour un utilisateur
   * @param userId ID de l'utilisateur
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const pattern = `auth:*${userId}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      await this.redis.delete(key);
    }
  }
  
  /**
   * Invalide le cache d'autorisation pour une ressource
   * @param resourceId ID de la ressource
   */
  async invalidateResourceCache(resourceId: string): Promise<void> {
    const pattern = `auth:*${resourceId}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      await this.redis.delete(key);
    }
  }
  
  /**
   * Ferme les connexions et libère les ressources
   */
  async close(): Promise<void> {
    await this.redis.close();
  }
}