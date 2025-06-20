import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { OPAConfig, OPAClient, OPAInput, OPAResult } from '../interface/opa.interface.js';


export class OPAClientImpl implements OPAClient {
  private readonly config: OPAConfig;
  private readonly axiosInstance: AxiosInstance;
  
  /**
   * Construit un nouveau client OPA
   * @param config Configuration OPA
   */
  constructor(config: OPAConfig) {
    this.config = config;
    
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.url,
      timeout: this.config.timeout || 5000,
    };
    
    this.axiosInstance = axios.create(axiosConfig);
  }
  
  /**
   * Vérifie si une action est autorisée selon les politiques
   * Données d'entrée pour l'évaluation de politique
   */
  async checkPermission(input: OPAInput): Promise<OPAResult> {
    try {
      const payload = { input };
      
      const response = await this.axiosInstance.post(this.config.policyPath, payload);
      
      console.log("Réponse OPA complète:", JSON.stringify(response.data, null, 2));
      
      // Extrait le résultat correct de la réponse OPA
      let result;
      
      if (response.data && response.data.result) {
        // Vérifier si la décision est dans result.decision
        if (response.data.result.decision) {
          result = response.data.result.decision;
          console.log("Décision extraite de result.decision:", result);
        } 
        // Sinon, utiliser directement result
        else {
          result = response.data.result;
          console.log("Utilisation directe de result:", result);
        }
      }
      
      if (typeof result === 'object' && result !== null && 'allow' in result) {
        return {
          allow: Boolean(result.allow),
          reason: result.reason || undefined
        };
      }
      
      if (typeof result === 'boolean') {
        return { allow: result };
      }
      
      return { allow: false, reason: 'Pas de décision retournée par la politique' };
    } catch (error) {
      console.error('Erreur lors de la vérification de permission OPA:', error);
      
      return { 
        allow: false, 
        reason: `Erreur d'évaluation de politique: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
  
  /**
   * Identifiant de la politique (chemin relatif)
   * Contenu de la politique (code Rego)
   */
  async updatePolicy(policyId: string, policy: string): Promise<void> {
    try {
      await this.axiosInstance.put(
        `/v1/policies/${policyId}`,
        policy,
        {
          headers: {
            'Content-Type': 'text/plain',
          },
        }
      );
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour de la politique: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Récupère une politique existante
   * Identifiant de la politique (chemin relatif)
   */
  async getPolicy(policyId: string): Promise<string> {
    try {
      const response = await this.axiosInstance.get(`/v1/policies/${policyId}`);
      return response.data.raw;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération de la politique: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}