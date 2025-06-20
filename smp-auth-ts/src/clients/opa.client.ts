/**
 * Client OPA (Open Policy Agent) simplifié
 * Fonctionnalités essentielles d'évaluation de politiques
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import {
  OPAConfig,
  OPAClientExtended,
  OPAInput,
  OPAResult,
  OPABatchRequest,
  OPABatchResult,
  OPAPolicy,
  PolicyFilter,
  OPAEvent,
  OPAEventType,
  OPAEventCallback
} from '../interface/opa.interface.js';

import { OperationOptions, ValidationResult } from '../interface/common.js';

export class OPAClientImpl implements OPAClientExtended {
  private readonly config: OPAConfig;
  private readonly axiosInstance: AxiosInstance;
  private eventCallbacks: Map<OPAEventType, OPAEventCallback[]> = new Map();
  
  // Cache local simple pour les politiques
  private policyCache: Map<string, OPAPolicy> = new Map();
  private resultCache: Map<string, { result: OPAResult; timestamp: number }> = new Map();
  
  // Métriques simplifiées
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now()
  };

  constructor(config: OPAConfig) {
    this.config = {
      timeout: 5000,
      apiVersion: 'v1',
      enableBatching: false,
      batchSize: 50,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
    
    this.axiosInstance = this.createAxiosInstance();
    this.setupInterceptors();
    this.setupEventHandlers();
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

    // Configuration d'authentification simple
    if (this.config.authentication) {
      this.applyAuthentication(axiosConfig);
    }

    return axios.create(axiosConfig);
  }

  private applyAuthentication(config: AxiosRequestConfig): void {
    const auth = this.config.authentication!;
    
    switch (auth.type) {
      case 'basic':
        if (auth.credentials?.username && auth.credentials?.password) {
          config.auth = {
            username: auth.credentials.username,
            password: auth.credentials.password
          };
        }
        break;
      
      case 'bearer':
        if (auth.credentials?.token) {
          config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${auth.credentials.token}`
          };
        }
        break;
    }
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.metrics.totalRequests++;
        return config;
      },
      (error) => {
        this.metrics.failedRequests++;
        return Promise.reject(this.enhanceError(error));
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.metrics.successfulRequests++;
        return response;
      },
      (error) => {
        this.metrics.failedRequests++;
        return Promise.reject(this.enhanceError(error));
      }
    );
  }

  private setupEventHandlers(): void {
    this.addEventListener('error_occurred', (event) => {
      console.error('[OPA] Error occurred:', event.data.error);
    });
  }

  private enhanceError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      let message = 'OPA request failed';

      if (axiosError.response) {
        switch (axiosError.response.status) {
          case 400:
            message = 'Invalid OPA request';
            break;
          case 401:
            message = 'OPA authentication failed';
            break;
          case 404:
            message = 'OPA policy not found';
            break;
          case 500:
            message = 'OPA policy evaluation error';
            break;
          case 503:
            message = 'OPA service unavailable';
            break;
        }
      } else if (axiosError.code === 'ECONNREFUSED') {
        message = 'Cannot connect to OPA server';
      } else if (axiosError.code === 'ETIMEDOUT') {
        message = 'OPA request timeout';
      }

      const enhancedError = new Error(`${message}: ${axiosError.message}`);
      (enhancedError as any).originalError = axiosError;
      (enhancedError as any).status = axiosError.response?.status;
      return enhancedError;
    }

    return error;
  }

  // ============================================================================
  // ÉVALUATION DE POLITIQUES DE BASE
  // ============================================================================

  async checkPermission(input: OPAInput, options?: OperationOptions): Promise<OPAResult> {
    const startTime = Date.now();
    
    try {
      // Vérifier le cache simple
      const cacheKey = this.generateCacheKey(input);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        return cached;
      }
      this.metrics.cacheMisses++;

      // Exécuter la vérification
      const result = await this.executePermissionCheck(input);

      // Mettre en cache le résultat
      this.setCachedResult(cacheKey, result);

      // Émettre un événement
      await this.emitEvent({
        type: 'decision_made',
        data: {
          timestamp: new Date().toISOString(),
          decision: {
            input,
            result,
            duration: Date.now() - startTime,
            cached: false
          }
        },
        timestamp: ''
      });

      return result;
    } catch (error) {
      await this.emitEvent({
        type: 'error_occurred',
        data: {
          timestamp: new Date().toISOString(),
          error: {
            code: 'EVALUATION_ERROR',
            message: error instanceof Error ? error.message : String(error),
            context: { input }
          }
        },
        timestamp: ''
      });

      throw error;
    }
  }

  private async executePermissionCheck(input: OPAInput): Promise<OPAResult> {
    const payload = { input };
    
    const response = await this.axiosInstance.post(this.config.policyPath, payload);
    
    // Extraire le résultat de la réponse OPA
    let result;
    
    if (response.data && response.data.result) {
      if (response.data.result.decision) {
        result = response.data.result.decision;
      } else {
        result = response.data.result;
      }
    }
    
    // Normaliser le résultat
    if (typeof result === 'object' && result !== null && 'allow' in result) {
      return {
        allow: Boolean(result.allow),
        reason: result.reason,
        decision: result.decision,
        evaluation: result.evaluation
      };
    }
    
    if (typeof result === 'boolean') {
      return { allow: result };
    }
    
    return {
      allow: false,
      reason: 'No decision returned by policy'
    };
  }

  // ============================================================================
  // ÉVALUATION PAR LOT
  // ============================================================================

  async checkPermissionBatch(request: OPABatchRequest): Promise<OPABatchResult> {
    const startTime = Date.now();
    const results: any[] = [];
    
    if (!this.config.enableBatching) {
      // Fallback vers l'évaluation séquentielle
      for (let i = 0; i < request.inputs.length; i++) {
        const input = request.inputs[i];
        const itemStartTime = Date.now();
        
        try {
          const result = await this.checkPermission(input);
          results.push({
            index: i,
            result,
            duration: Date.now() - itemStartTime
          });
        } catch (error) {
          results.push({
            index: i,
            error: {
              code: 'EVALUATION_ERROR',
              message: error instanceof Error ? error.message : String(error)
            },
            duration: Date.now() - itemStartTime
          });
        }
      }
    } else {
      // Évaluation en lot native (implémentation simple)
      const batchPayload = {
        inputs: request.inputs.reduce((acc, input, index) => {
          acc[`request_${index}`] = { input };
          return acc;
        }, {} as any)
      };
      
      try {
        const response = await this.axiosInstance.post(this.config.policyPath, batchPayload);
        
        Object.entries(response.data.result || {}).forEach(([key, value], index) => {
          results.push({
            index,
            result: this.normalizeResult(value),
            duration: 0
          });
        });
      } catch (error) {
        throw this.enhanceError(error);
      }
    }
    
    // Calculer les statistiques du lot
    const totalDuration = Date.now() - startTime;
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    const allowed = results.filter(r => r.result?.allow).length;
    const denied = results.filter(r => r.result && !r.result.allow).length;
    
    const durations = results.map(r => r.duration).filter(d => d > 0);
    const averageDuration = durations.length > 0 ? 
      durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    return {
      results,
      summary: {
        total: request.inputs.length,
        successful,
        failed,
        allowed,
        denied,
        averageDuration,
        maxDuration: Math.max(...durations, 0),
        minDuration: Math.min(...durations, Infinity) === Infinity ? 0 : Math.min(...durations)
      },
      metadata: {
        requestId: this.generateRequestId(),
        timestamp: new Date().toISOString(),
        totalDuration
      }
    };
  }

  private normalizeResult(value: any): OPAResult {
    if (typeof value === 'object' && value !== null && 'allow' in value) {
      return {
        allow: Boolean(value.allow),
        reason: value.reason
      };
    }
    
    if (typeof value === 'boolean') {
      return { allow: value };
    }
    
    return {
      allow: false,
      reason: 'Invalid result format'
    };
  }

  // ============================================================================
  // GESTION DES POLITIQUES
  // ============================================================================

  async updatePolicy(policyId: string, policy: string): Promise<void> {
    const url = `/v1/policies/${policyId}`;
    
    try {
      await this.axiosInstance.put(url, policy, {
        headers: {
          'Content-Type': 'text/plain'
        }
      });
      
      this.policyCache.delete(policyId);
      
      await this.emitEvent({
        type: 'policy_updated',
        data: {
          timestamp: new Date().toISOString(),
          policy: {
            id: policyId,
            name: policyId,
            version: 'unknown'
          }
        },
        timestamp: ''
      });
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getPolicy(policyId: string): Promise<string> {
    const url = `/v1/policies/${policyId}`;
    
    try {
      const response = await this.axiosInstance.get(url);
      return response.data.raw || response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async createPolicy(policy: Omit<OPAPolicy, 'id' | 'metadata.createdAt' | 'metadata.updatedAt'>): Promise<string> {
    const policyId = policy.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    await this.updatePolicy(policyId, policy.content);
    
    const fullPolicy: OPAPolicy = {
      ...policy,
      id: policyId,
      metadata: {
        ...policy.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    
    this.policyCache.set(policyId, fullPolicy);
    
    await this.emitEvent({
      type: 'policy_loaded',
      data: {
        timestamp: new Date().toISOString(),
        policy: {
          id: policyId,
          name: policy.name,
          version: policy.version
        }
      },
      timestamp: ''
    });
    
    return policyId;
  }

  async deletePolicy(policyId: string): Promise<void> {
    const url = `/v1/policies/${policyId}`;
    
    try {
      await this.axiosInstance.delete(url);
      this.policyCache.delete(policyId);
      
      await this.emitEvent({
        type: 'policy_updated',
        data: {
          timestamp: new Date().toISOString(),
          policy: {
            id: policyId,
            name: policyId,
            version: 'unknown'
          }
        },
        timestamp: ''
      });
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async listPolicies(filter?: PolicyFilter): Promise<OPAPolicy[]> {
    const url = '/v1/policies';
    
    try {
      const response = await this.axiosInstance.get(url);
      const policies = response.data.result || [];
      
      const opaPolicies: OPAPolicy[] = [];
      
      for (const [policyId, policyData] of Object.entries(policies)) {
        if (typeof policyData === 'object') {
          const policy: OPAPolicy = {
            id: policyId,
            name: policyId,
            version: '1.0.0',
            content: (policyData as any).raw || '',
            language: 'rego',
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            config: {
              enabled: true,
              priority: 100,
              scope: []
            }
          };
          
          opaPolicies.push(policy);
        }
      }
      
      return this.applyPolicyFilters(opaPolicies, filter);
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  private applyPolicyFilters(policies: OPAPolicy[], filter?: PolicyFilter): OPAPolicy[] {
    if (!filter) return policies;
    
    return policies.filter(policy => {
      if (filter.name && !policy.name.includes(filter.name)) return false;
      if (filter.category && policy.metadata.category !== filter.category) return false;
      if (filter.enabled !== undefined && policy.config?.enabled !== filter.enabled) return false;
      if (filter.author && policy.metadata.author !== filter.author) return false;
      if (filter.tags && filter.tags.length > 0) {
        const policyTags = policy.metadata.tags || [];
        if (!filter.tags.some(tag => policyTags.includes(tag))) return false;
      }
      
      return true;
    });
  }

  async validatePolicy(content: string): Promise<ValidationResult> {
    const url = '/v1/compile';
    
    try {
      const payload = {
        query: 'data',
        input: {},
        modules: {
          'policy.rego': content
        }
      };
      
      const response = await this.axiosInstance.post(url, payload);
      
      if (response.data.errors && response.data.errors.length > 0) {
        return {
          valid: false,
          errors: response.data.errors.map((err: any) => err.message),
          warnings: []
        };
      }
      
      return {
        valid: true,
        errors: [],
        warnings: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      };
    }
  }

  // ============================================================================
  // GESTION DES DONNÉES
  // ============================================================================

  async setData(path: string, data: any): Promise<void> {
    const url = `/v1/data/${path}`;
    
    try {
      await this.axiosInstance.put(url, data);
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async getData(path: string): Promise<any> {
    const url = `/v1/data/${path}`;
    
    try {
      const response = await this.axiosInstance.get(url);
      return response.data.result;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async deleteData(path: string): Promise<void> {
    const url = `/v1/data/${path}`;
    
    try {
      await this.axiosInstance.delete(url);
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  // ============================================================================
  // MONITORING ET TEST
  // ============================================================================

  async getServerInfo(): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/');
      return response.data;
    } catch (error) {
      throw this.enhanceError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async testConnection(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.healthCheck();
      const latency = Date.now() - startTime;
      
      if (!isHealthy) {
        return {
          connected: false,
          error: 'Health check failed',
          latency
        };
      }
      
      const serverInfo = await this.getServerInfo().catch(() => null);
      
      return {
        connected: true,
        info: 'OPA connection successful',
        latency,
        details: {
          serverInfo,
          metrics: this.getMetrics()
        }
      };
    } catch (error) {
      return {
        connected: false,
        error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        latency: Date.now() - startTime
      };
    }
  }

  getMetrics(): Record<string, any> {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      errorRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.failedRequests / this.metrics.totalRequests) * 100 : 0,
      cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 ?
        (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 : 0
    };
  }

  // ============================================================================
  // ÉVÉNEMENTS
  // ============================================================================

  private addEventListener(eventType: OPAEventType, callback: OPAEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  private async emitEvent(event: Omit<OPAEvent, 'id' | 'source'>): Promise<void> {
    const fullEvent: OPAEvent = {
      id: this.generateId(),
      source: 'opa',
      ...event
    };
    
    const callbacks = this.eventCallbacks.get(event.type) || [];
    for (const callback of callbacks) {
      try {
        await callback(fullEvent);
      } catch (error) {
        console.error(`Event callback error for ${event.type}:`, error);
      }
    }
  }

  // ============================================================================
  // UTILITAIRES PRIVÉS
  // ============================================================================

  private generateCacheKey(input: OPAInput): string {
    return Buffer.from(JSON.stringify(input)).toString('base64');
  }

  private getCachedResult(key: string): OPAResult | null {
    const cached = this.resultCache.get(key);
    if (!cached) return null;
    
    const expiryTime = 300000; // 5 minutes
    if (Date.now() - cached.timestamp > expiryTime) {
      this.resultCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  private setCachedResult(key: string, result: OPAResult): void {
    this.resultCache.set(key, {
      result,
      timestamp: Date.now()
    });
    
    // Limiter la taille du cache
    if (this.resultCache.size > 1000) {
      const firstKey = this.resultCache.keys().next().value;
      if (firstKey) {
        this.resultCache.delete(firstKey);
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================================================
  // FERMETURE
  // ============================================================================

  async close(): Promise<void> {
    this.policyCache.clear();
    this.resultCache.clear();
    this.eventCallbacks.clear();
    
    console.log('OPA client closed');
  }
}