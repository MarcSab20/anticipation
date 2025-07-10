import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import {
  OPAConfig,
  OPAInput,
  OPAResult,
  OPAClient,
  OPAPolicy,
  PolicyFilter,
  OPAEvent,
  OPAEventType,
  OPAEventCallback
} from '../interface/opa.interface.js';

import { OperationOptions, ValidationResult } from '../interface/common.js';

export class OPAClientImpl implements OPAClient {
  private readonly config: OPAConfig;
  private readonly axiosInstance: AxiosInstance;
  private eventCallbacks: Map<OPAEventType, OPAEventCallback[]> = new Map();
  
  private policyCache: Map<string, OPAPolicy> = new Map();
  private resultCache: Map<string, { result: OPAResult; timestamp: number }> = new Map();
  

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

  private createAxiosInstance(): AxiosInstance {
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.url,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

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
        return config;
      },
      (error) => {
        return Promise.reject(this.enhanceError(error));
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
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

  async checkPermission(input: OPAInput, options?: OperationOptions): Promise<OPAResult> {
    const startTime = Date.now();
    
    try {
      // Vérifier le cache simple
      const cacheKey = this.generateCacheKey(input);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

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

  async close(): Promise<void> {
    this.policyCache.clear();
    this.resultCache.clear();
    this.eventCallbacks.clear();
    
    console.log('OPA client closed');
  }
}