/**
 * Interface OPA (Open Policy Agent) simplifiée
 * Fonctionnalités essentielles pour l'évaluation de politiques
 */

import type { 
  AuthorizationContext, 
  OperationOptions, 
  ValidationResult,
  Priority,
  UserId
} from './common.js';

// ============================================================================
// CONFIGURATION OPA
// ============================================================================

export interface OPAConfig {
  url: string;
  policyPath: string;
  timeout?: number;
  apiVersion?: string;
  enableBatching?: boolean;
  batchSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
  authentication?: {
    type: 'none' | 'basic' | 'bearer';
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
    };
  };
}

// ============================================================================
// STRUCTURES DE DONNÉES D'ENTRÉE OPA
// ============================================================================

export interface OPAInput {
  user: OPAUser;
  resource: OPAResource;
  action: string;
  context?: OPAContext;
}

export interface OPAUser {
  id: string;
  roles: string[];
  organization_ids?: string[];
  state?: string;
  attributes?: OPAUserAttributes;
}

export interface OPAUserAttributes {
  department?: string;
  clearanceLevel?: number;
  contractExpiryDate?: string;
  managerId?: string;
  jobTitle?: string;
  businessUnit?: string;
  workLocation?: string;
  employmentType?: string;
  verificationStatus?: string;
  riskScore?: number;
  [key: string]: any;
}

export interface OPAResource {
  id: string;
  type: string;
  owner_id?: string;
  organization_id?: string;
  attributes?: OPAResourceAttributes;
}

export interface OPAResourceAttributes {
  isOfficial?: boolean;
  department?: string;
  confidential?: boolean;
  requiredClearance?: number;
  classification?: string;
  state?: string;
  [key: string]: any;
}

export interface OPAContext extends AuthorizationContext {
  request?: {
    id: string;
    timestamp: string;
    method?: string;
    endpoint?: string;
  };
  business?: {
    processId?: string;
    workflowStep?: string;
    criticality?: Priority;
    businessHours?: boolean;
  };
}

// ============================================================================
// RÉSULTATS OPA
// ============================================================================

export interface OPAResult {
  allow: boolean;
  reason?: string;
  decision?: OPADecisionDetails;
  evaluation?: {
    duration: number;
    rulesEvaluated: number;
    policiesInvolved: string[];
  };
}

export interface OPADecisionDetails {
  policyId: string;
  ruleId?: string;
  factors: OPADecisionFactor[];
  conditions: Record<string, any>;
  confidence: number;
  explanation: string;
}

export interface OPADecisionFactor {
  type: 'user' | 'resource' | 'context' | 'policy' | 'rule';
  name: string;
  value: any;
  weight: number;
  impact: 'allow' | 'deny' | 'neutral';
  description?: string;
}

// ============================================================================
// GESTION DES POLITIQUES
// ============================================================================

export interface OPAPolicy {
  id: string;
  name: string;
  version: string;
  content: string;
  language: 'rego' | 'json';
  metadata: {
    description?: string;
    author?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
    category?: string;
  };
  config?: {
    enabled: boolean;
    priority: number;
    scope: string[];
  };
}

export interface PolicyFilter {
  name?: string;
  category?: string;
  tags?: string[];
  enabled?: boolean;
  author?: string;
}

// ============================================================================
// ÉVALUATION PAR LOT
// ============================================================================

export interface OPABatchRequest {
  inputs: OPAInput[];
  options?: {
    parallel?: boolean;
    maxConcurrency?: number;
    continueOnError?: boolean;
    timeout?: number;
  };
}

export interface OPABatchResult {
  results: OPABatchItemResult[];
  summary: OPABatchSummary;
  metadata: {
    requestId: string;
    timestamp: string;
    totalDuration: number;
  };
}

export interface OPABatchItemResult {
  index: number;
  result?: OPAResult;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  duration: number;
}

export interface OPABatchSummary {
  total: number;
  successful: number;
  failed: number;
  allowed: number;
  denied: number;
  averageDuration: number;
  maxDuration: number;
  minDuration: number;
}

// ============================================================================
// INTERFACES CLIENT OPA
// ============================================================================

export interface OPAClient {
  checkPermission(input: OPAInput, options?: OperationOptions): Promise<OPAResult>;
  updatePolicy(policyId: string, policy: string): Promise<void>;
  getPolicy(policyId: string): Promise<string>;
  healthCheck(): Promise<boolean>;
}

export interface OPAClientExtended extends OPAClient {
  // Évaluation avancée
  checkPermissionBatch(request: OPABatchRequest): Promise<OPABatchResult>;
  
  // Gestion des politiques
  createPolicy(policy: Omit<OPAPolicy, 'id' | 'metadata.createdAt' | 'metadata.updatedAt'>): Promise<string>;
  deletePolicy(policyId: string): Promise<void>;
  listPolicies(filter?: PolicyFilter): Promise<OPAPolicy[]>;
  validatePolicy(content: string): Promise<ValidationResult>;
  
  // Gestion des données
  setData(path: string, data: any): Promise<void>;
  getData(path: string): Promise<any>;
  deleteData(path: string): Promise<void>;
  
  // Monitoring
  getServerInfo(): Promise<any>;
  
  // Test et fermeture
  testConnection(): Promise<any>;
  close(): Promise<void>;
}

// ============================================================================
// ÉVÉNEMENTS OPA (Simplifiés)
// ============================================================================

export type OPAEventType = 
  | 'policy_loaded'
  | 'policy_updated' 
  | 'decision_made'
  | 'error_occurred';

export interface OPAEvent {
  id: string;
  type: OPAEventType;
  source: 'opa';
  timestamp: string;
  data: OPAEventData;
}

export interface OPAEventData {
  timestamp: string;
  policy?: {
    id: string;
    name: string;
    version: string;
  };
  decision?: {
    input: OPAInput;
    result: OPAResult;
    duration: number;
    cached: boolean;
  };
  error?: {
    code: string;
    message: string;
    context?: any;
  };
}

export type OPAEventCallback = (event: OPAEvent) => void | Promise<void>;

// ============================================================================
// CONSTANTES
// ============================================================================

export const OPA_STANDARD_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  SEARCH: 'search',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  SHARE: 'share',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  ADMIN: 'admin'
} as const;

export const OPA_STANDARD_RESOURCE_TYPES = {
  DOCUMENT: 'document',
  PROJECT: 'project',
  USER: 'user',
  ORGANIZATION: 'organization',
  DATASET: 'dataset',
  REPORT: 'report',
  WORKFLOW: 'workflow',
  TASK: 'task',
  FILE: 'file',
  FOLDER: 'folder',
  SYSTEM: 'system',
  API: 'api'
} as const;