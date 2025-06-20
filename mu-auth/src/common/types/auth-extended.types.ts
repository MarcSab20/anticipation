// mu-auth/src/common/types/auth-extended.types.ts

import { 
  UserInfo as SmpUserInfo,
  AuthEventType as SmpAuthEventType,
  EnrichedTokenValidationResult as SmpEnrichedTokenValidationResult
} from 'smp-auth-ts';

/**
 * Types étendus pour les besoins spécifiques de mu-auth
 */

// Extension des types d'événements pour inclure les événements métier
export type ExtendedAuthEventType = SmpAuthEventType | 'sync' | 'user_creation' | 'role_assignment';

// Interface utilisateur étendue avec les données PostgreSQL
export interface ExtendedUserInfo extends SmpUserInfo {
  // Données spécifiques PostgreSQL
  created_timestamp?: Date;
  updated_timestamp?: Date;
  last_login?: Date;
  failed_login_attempts?: number;
  locked_until?: Date;
  
  // Attributs étendus
  attributes?: SmpUserInfo['attributes'] & {
    territorialJurisdiction?: string;
    technicalExpertise?: string[];
    hierarchyLevel?: number;
    certifications?: string[];
    additionalAttributes?: Record<string, any>;
  };
}

// Résultat de validation enrichie compatible
export interface ExtendedEnrichedTokenValidationResult extends Omit<SmpEnrichedTokenValidationResult, 'userInfo'> {
  userInfo?: ExtendedUserInfo;
}

// Interface pour les événements d'authentification étendus
export interface ExtendedAuthEvent {
  id: string;
  type: ExtendedAuthEventType;
  userId?: string;
  username?: string;
  success: boolean;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, any>;
  error?: string;
  duration?: number;
  correlationId?: string;
  sessionId?: string;
}

// Mappers de types pour la compatibilité
export class TypeMappers {
  /**
   * Convertit UserInfo de smp-auth-ts vers ExtendedUserInfo
   */
  static toExtendedUserInfo(userInfo: SmpUserInfo, pgData?: any): ExtendedUserInfo {
    const extended: ExtendedUserInfo = {
      ...userInfo,
      attributes: {
        ...userInfo.attributes,
        territorialJurisdiction: pgData?.territorial_jurisdiction || userInfo.attributes?.territorialJurisdiction,
        technicalExpertise: pgData?.technical_expertise || userInfo.attributes?.technicalExpertise,
        hierarchyLevel: pgData?.hierarchy_level || userInfo.attributes?.hierarchyLevel,
        certifications: pgData?.certifications || userInfo.attributes?.certifications,
        additionalAttributes: pgData?.custom_attributes || userInfo.attributes?.additionalAttributes
      }
    };

    if (pgData) {
      extended.created_timestamp = pgData.created_timestamp;
      extended.updated_timestamp = pgData.updated_timestamp;
      extended.last_login = pgData.last_login;
      extended.failed_login_attempts = pgData.failed_login_attempts;
      extended.locked_until = pgData.locked_until;
    }

    return extended;
  }

  /**
   * Convertit ExtendedUserInfo vers le format PostgreSQL
   */
  static toPostgresUserData(userInfo: ExtendedUserInfo): Record<string, any> {
    return {
      username: userInfo.preferred_username,
      email: userInfo.email,
      email_verified: userInfo.email_verified,
      first_name: userInfo.given_name,
      last_name: userInfo.family_name,
      enabled: userInfo.state === 'active',
      department: userInfo.attributes?.department,
      clearance_level: userInfo.attributes?.clearanceLevel,
      contract_expiry_date: userInfo.attributes?.contractExpiryDate ? new Date(userInfo.attributes.contractExpiryDate) : null,
      manager_id: userInfo.attributes?.managerId,
      job_title: userInfo.attributes?.jobTitle,
      business_unit: userInfo.attributes?.businessUnit,
      territorial_jurisdiction: userInfo.attributes?.territorialJurisdiction,
      technical_expertise: userInfo.attributes?.technicalExpertise,
      hierarchy_level: userInfo.attributes?.hierarchyLevel,
      work_location: userInfo.attributes?.workLocation,
      employment_type: userInfo.attributes?.employmentType,
      verification_status: userInfo.attributes?.verificationStatus,
      risk_score: userInfo.attributes?.riskScore,
      certifications: userInfo.attributes?.certifications,
      phone_number: userInfo.attributes?.phoneNumber,
      nationality: userInfo.attributes?.nationality,
      date_of_birth: userInfo.attributes?.dateOfBirth ? new Date(userInfo.attributes.dateOfBirth) : null,
      gender: userInfo.attributes?.gender,
      state: userInfo.state,
      custom_attributes: userInfo.attributes?.additionalAttributes
    };
  }

  /**
   * Mappe les types d'événements de smp-auth-ts vers les types locaux
   */
  static mapEventType(eventType: SmpAuthEventType): ExtendedAuthEventType {
    // Tous les types de smp-auth-ts sont compatibles
    return eventType;
  }

  /**
   * Vérifie si un type d'événement est supporté localement
   */
  static isLocalEventType(eventType: string): eventType is ExtendedAuthEventType {
    const localTypes: ExtendedAuthEventType[] = [
      'login', 'logout', 'token_refresh', 'token_validation', 
      'authorization_check', 'error', 'sync', 'user_creation', 'role_assignment'
    ];
    return localTypes.includes(eventType as ExtendedAuthEventType);
  }
}

// Constantes pour les événements locaux
export const LOCAL_EVENT_TYPES = {
  SYNC: 'sync' as const,
  USER_CREATION: 'user_creation' as const,
  ROLE_ASSIGNMENT: 'role_assignment' as const
} as const;

// Interface pour les métriques étendues
export interface ExtendedMetrics {
  // Métriques de smp-auth-ts
  totalRequests: number;
  successfulLogins: number;
  failedLogins: number;
  tokenValidations: number;
  authorizationChecks: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  
  // Métriques locales
  postgresUsers: number;
  syncOperations: number;
  eventLogs: number;
  activeSessions: number;
  
  // Métriques de performance
  averageResponseTime: number;
  uptime: number;
  startTime: number;
}

// Interface pour la configuration étendue
export interface ExtendedAuthConfig {
  // Configuration de base héritée de smp-auth-ts
  enablePostgresSync?: boolean;
  enableEventLogging?: boolean;
  enableSessionTracking?: boolean;
  
  // Configuration PostgreSQL spécifique
  postgres?: {
    syncInterval?: number;
    batchSize?: number;
    enableBidirectionalSync?: boolean;
  };
  
  // Configuration des événements
  events?: {
    enableDetailedLogging?: boolean;
    logRetentionDays?: number;
    enableMetrics?: boolean;
  };
}