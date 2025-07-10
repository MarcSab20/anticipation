// mu-auth/src/auth/services/keycloak-postgres-sync.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostgresUserService, UserCreationData } from './postgres-user.service';
import { createHash } from 'crypto';
import { 
  SyncType, 
  SyncDirection, 
  SyncStatus,
  Prisma 
} from '@prisma/client';

interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  groups?: string[];
  realmRoles?: string[];
  clientRoles?: Record<string, string[]>;
}

interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  errors: Array<{ id: string; error: string }>;
  duration: number;
}

interface SyncOptions {
  dryRun?: boolean;
  batchSize?: number;
  skipValidation?: boolean;
  forceUpdate?: boolean;
}

@Injectable()
export class KeycloakPostgresSyncService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakPostgresSyncService.name);
  private adminToken: string = '';
  private tokenExpiresAt: number = 0;
  private isSyncing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly userService: PostgresUserService
  ) {}

  async onModuleInit() {
    // Initialiser la configuration de synchronisation
    await this.initializeSyncConfiguration();
    this.logger.log('✅ KeycloakPostgresSyncService initialized');
  }

  // ============================================================================
  // MÉTHODES PUBLIQUES PRINCIPALES
  // ============================================================================

  /**
   * Synchronisation complète bidirectionnelle
   */
  async performFullSync(options?: SyncOptions): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const syncLog = await this.createSyncLog(SyncType.FULL_SYNC, SyncDirection.BIDIRECTIONAL);
    
    try {
      this.logger.log('🔄 Starting full bidirectional sync...');
      
      // 1. Sync Keycloak → PostgreSQL
      const keycloakToPostgres = await this.syncKeycloakToPostgres(options);
      
      // 2. Sync PostgreSQL → Keycloak (nouveaux utilisateurs créés localement)
      const postgresToKeycloak = await this.syncPostgresToKeycloak(options);
      
      // 3. Synchroniser les rôles et organisations
      await this.syncRolesAndOrganizations();
      
      const totalResult: SyncResult = {
        success: true,
        processed: keycloakToPostgres.processed + postgresToKeycloak.processed,
        created: keycloakToPostgres.created + postgresToKeycloak.created,
        updated: keycloakToPostgres.updated + postgresToKeycloak.updated,
        deleted: keycloakToPostgres.deleted + postgresToKeycloak.deleted,
        errors: [...keycloakToPostgres.errors, ...postgresToKeycloak.errors],
        duration: Date.now() - syncLog.startedAt.getTime()
      };

      await this.completeSyncLog(syncLog.id, SyncStatus.COMPLETED, totalResult);
      
      this.logger.log(`✅ Full sync completed: processed=${totalResult.processed}, created=${totalResult.created}, updated=${totalResult.updated}, errors=${totalResult.errors.length}`);
      
      return totalResult;
      
    } catch (error) {
      await this.completeSyncLog(syncLog.id, SyncStatus.FAILED, undefined, error.message);
      this.logger.error(`❌ Full sync failed: ${error.message}`);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Synchroniser un utilisateur spécifique
   */
  async syncSpecificUser(keycloakUserId: string, direction: SyncDirection = SyncDirection.KEYCLOAK_TO_POSTGRES): Promise<boolean> {
    const syncLog = await this.createSyncLog(SyncType.USER_SYNC, direction, keycloakUserId);
    
    try {
      this.logger.debug(`Syncing specific user: ${keycloakUserId} (${direction})`);
      
      if (direction === SyncDirection.KEYCLOAK_TO_POSTGRES) {
        const keycloakUser = await this.getKeycloakUser(keycloakUserId);
        if (!keycloakUser) {
          throw new Error(`Keycloak user not found: ${keycloakUserId}`);
        }
        
        await this.syncKeycloakUserToPostgres(keycloakUser);
      } else {
        // Sync PostgreSQL → Keycloak
        const postgresUser = await this.prisma.user.findFirst({
          where: { keycloakId: keycloakUserId },
          include: {
            roles: { include: { role: true } },
            organizations: { include: { organization: true } },
            attributes: true
          }
        });
        
        if (!postgresUser) {
          throw new Error(`PostgreSQL user not found for Keycloak ID: ${keycloakUserId}`);
        }
        
        await this.syncPostgresUserToKeycloak(postgresUser);
      }
      
      await this.completeSyncLog(syncLog.id, SyncStatus.COMPLETED);
      return true;
      
    } catch (error) {
      await this.completeSyncLog(syncLog.id, SyncStatus.FAILED, undefined, error.message);
      this.logger.error(`Failed to sync user ${keycloakUserId}: ${error.message}`);
      return false;
    }
  }

  // ============================================================================
  // SYNCHRONISATION KEYCLOAK → POSTGRESQL
  // ============================================================================

  private async syncKeycloakToPostgres(options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      duration: 0
    };

    try {
      const keycloakUsers = await this.getAllKeycloakUsers();
      result.processed = keycloakUsers.length;
      
      this.logger.debug(`Processing ${keycloakUsers.length} Keycloak users...`);
      
      const batchSize = options?.batchSize || 50;
      
      for (let i = 0; i < keycloakUsers.length; i += batchSize) {
        const batch = keycloakUsers.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (keycloakUser) => {
            try {
              const syncResult = await this.syncKeycloakUserToPostgres(keycloakUser, options);
              if (syncResult.created) result.created++;
              if (syncResult.updated) result.updated++;
            } catch (error) {
              result.errors.push({
                id: keycloakUser.id,
                error: error.message
              });
            }
          })
        );
        
        // Petit délai entre les batches pour éviter la surcharge
        if (i + batchSize < keycloakUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
    } catch (error) {
      result.success = false;
      throw error;
    }
    
    result.duration = Date.now() - startTime;
    return result;
  }

  private async syncKeycloakUserToPostgres(
    keycloakUser: KeycloakUser, 
    options?: SyncOptions
  ): Promise<{ created: boolean; updated: boolean }> {
    
    // Vérifier si l'utilisateur existe déjà
    const existingMapping = await this.prisma.syncMapping.findUnique({
      where: { keycloakUserId: keycloakUser.id }
    });

    const userData = this.mapKeycloakUserToPostgres(keycloakUser);
    const syncHash = this.generateSyncHash(userData);

    if (existingMapping) {
      // Vérifier si une mise à jour est nécessaire
      if (existingMapping.syncHash === syncHash && !options?.forceUpdate) {
        return { created: false, updated: false };
      }

      // Mettre à jour l'utilisateur existant
      const existingUser = await this.prisma.user.findUnique({
        where: { id: existingMapping.postgresUserId }
      });

      if (existingUser) {
        if (!options?.dryRun) {
          await this.updateExistingUser(existingUser.id, userData, keycloakUser);
          
          // Mettre à jour le mapping
          await this.prisma.syncMapping.update({
            where: { id: existingMapping.id },
            data: {
              lastSyncAt: new Date(),
              keycloakUpdatedAt: keycloakUser.createdTimestamp ? 
                new Date(keycloakUser.createdTimestamp) : new Date(),
              syncHash
            }
          });
        }
        
        return { created: false, updated: true };
      }
    }

    // Créer un nouvel utilisateur
    if (!options?.dryRun) {
      const newUser = await this.createNewUser(userData, keycloakUser);
      
      // Créer le mapping
      await this.prisma.syncMapping.create({
        data: {
          keycloakUserId: keycloakUser.id,
          postgresUserId: newUser.id,
          lastSyncAt: new Date(),
          keycloakUpdatedAt: keycloakUser.createdTimestamp ? 
            new Date(keycloakUser.createdTimestamp) : new Date(),
          postgresUpdatedAt: new Date(),
          syncHash
        }
      });
    }

    return { created: true, updated: false };
  }

  // ============================================================================
  // SYNCHRONISATION POSTGRESQL → KEYCLOAK
  // ============================================================================

  private async syncPostgresToKeycloak(options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      processed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      duration: 0
    };

    try {
      // Récupérer les utilisateurs PostgreSQL sans mapping Keycloak ou modifiés récemment
      const postgresUsers = await this.prisma.user.findMany({
        where: {
          OR: [
            { keycloakId: null },
            {
              updatedTimestamp: {
                gt: new Date(Date.now() - 60 * 60 * 1000) // Modifiés dans la dernière heure
              }
            }
          ]
        },
        include: {
          roles: { include: { role: true } },
          organizations: { include: { organization: true } },
          attributes: true
        }
      });

      result.processed = postgresUsers.length;
      
      for (const postgresUser of postgresUsers) {
        try {
          const syncResult = await this.syncPostgresUserToKeycloak(postgresUser, options);
          if (syncResult.created) result.created++;
          if (syncResult.updated) result.updated++;
        } catch (error) {
          result.errors.push({
            id: postgresUser.id,
            error: error.message
          });
        }
      }
      
    } catch (error) {
      result.success = false;
      throw error;
    }
    
    result.duration = Date.now() - startTime;
    return result;
  }

  private async syncPostgresUserToKeycloak(
    postgresUser: any, 
    options?: SyncOptions
  ): Promise<{ created: boolean; updated: boolean }> {
    
    if (postgresUser.keycloakId) {
      // Mettre à jour l'utilisateur existant dans Keycloak
      const keycloakUserData = this.mapPostgresUserToKeycloak(postgresUser);
      
      if (!options?.dryRun) {
        await this.updateKeycloakUser(postgresUser.keycloakId, keycloakUserData);
      }
      
      return { created: false, updated: true };
    } else {
      // Créer un nouvel utilisateur dans Keycloak
      const keycloakUserData = this.mapPostgresUserToKeycloak(postgresUser);
      
      if (!options?.dryRun) {
        const keycloakUserId = await this.createKeycloakUser(keycloakUserData);
        
        // Mettre à jour l'utilisateur PostgreSQL avec l'ID Keycloak
        await this.prisma.user.update({
          where: { id: postgresUser.id },
          data: { keycloakId: keycloakUserId }
        });
        
        // Créer le mapping
        await this.prisma.syncMapping.create({
          data: {
            keycloakUserId,
            postgresUserId: postgresUser.id,
            lastSyncAt: new Date(),
            keycloakUpdatedAt: new Date(),
            postgresUpdatedAt: postgresUser.updatedTimestamp,
            syncHash: this.generateSyncHash(postgresUser)
          }
        });
      }
      
      return { created: true, updated: false };
    }
  }

  // ============================================================================
  // MÉTHODES KEYCLOAK
  // ============================================================================

  private async getKeycloakAdminToken(): Promise<string> {
    if (this.adminToken && Date.now() < this.tokenExpiresAt) {
      return this.adminToken;
    }

    const axios = (await import('axios')).default;
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    const clientId = this.configService.get('KEYCLOAK_ADMIN_CLIENT_ID') || 
                    this.configService.get('KEYCLOAK_CLIENT_ID');
    const clientSecret = this.configService.get('KEYCLOAK_ADMIN_CLIENT_SECRET') || 
                        this.configService.get('KEYCLOAK_CLIENT_SECRET');

    const response = await axios.post(
      `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    this.adminToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 30000; // 30s de marge

    return this.adminToken;
  }

  private async getAllKeycloakUsers(): Promise<KeycloakUser[]> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    const users: KeycloakUser[] = [];
    let first = 0;
    const max = 100;
    
    while (true) {
      const response = await axios.get(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { first, max }
        }
      );
      
      const batch = response.data;
      if (batch.length === 0) break;
      
      users.push(...batch);
      first += max;
      
      if (batch.length < max) break;
    }
    
    return users;
  }

  private async getKeycloakUser(userId: string): Promise<KeycloakUser | null> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    try {
      const response = await axios.get(
        `${keycloakUrl}/admin/realms/${realm}/users/${userId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async createKeycloakUser(userData: any): Promise<string> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    const response = await axios.post(
      `${keycloakUrl}/admin/realms/${realm}/users`,
      userData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const location = response.headers.location;
    if (!location) {
      throw new Error('No location header in Keycloak user creation response');
    }
    
    return location.split('/').pop()!;
  }

  private async updateKeycloakUser(userId: string, userData: any): Promise<void> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');
    
    await axios.put(
      `${keycloakUrl}/admin/realms/${realm}/users/${userId}`,
      userData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // ============================================================================
  // MÉTHODES DE MAPPING DES DONNÉES
  // ============================================================================

  private mapKeycloakUserToPostgres(keycloakUser: KeycloakUser): UserCreationData {
    const attributes = keycloakUser.attributes || {};
    
    return {
      keycloakId: keycloakUser.id,
      username: keycloakUser.username,
      email: keycloakUser.email || '',
      emailVerified: keycloakUser.emailVerified || false,
      firstName: keycloakUser.firstName,
      lastName: keycloakUser.lastName,
      enabled: keycloakUser.enabled,
      
      // Mapping des attributs métier
      department: this.getFirstAttribute(attributes, 'department'),
      clearanceLevel: parseInt(this.getFirstAttribute(attributes, 'clearance_level') || '1'),
      contractExpiryDate: this.parseDate(this.getFirstAttribute(attributes, 'contract_expiry_date')),
      managerId: this.getFirstAttribute(attributes, 'manager_id'),
      jobTitle: this.getFirstAttribute(attributes, 'job_title'),
      businessUnit: this.getFirstAttribute(attributes, 'business_unit'),
      territorialJurisdiction: this.getFirstAttribute(attributes, 'territorial_jurisdiction'),
      technicalExpertise: attributes.technical_expertise || [],
      hierarchyLevel: parseInt(this.getFirstAttribute(attributes, 'hierarchy_level') || '1'),
      workLocation: this.getFirstAttribute(attributes, 'work_location'),
      employmentType: this.getFirstAttribute(attributes, 'employment_type') || 'PERMANENT',
      verificationStatus: this.getFirstAttribute(attributes, 'verification_status') || 'PENDING',
      riskScore: parseFloat(this.getFirstAttribute(attributes, 'risk_score') || '0'),
      certifications: attributes.certifications || [],
      phoneNumber: this.getFirstAttribute(attributes, 'phone_number'),
      nationality: this.getFirstAttribute(attributes, 'nationality'),
      dateOfBirth: this.parseDate(this.getFirstAttribute(attributes, 'date_of_birth')),
      gender: this.getFirstAttribute(attributes, 'gender'),
      state: keycloakUser.enabled ? 'ACTIVE' : 'INACTIVE',
      
      // Stocker les attributs personnalisés
      customAttributes: this.extractCustomAttributes(attributes)
    };
  }

  private mapPostgresUserToKeycloak(postgresUser: any): any {
    return {
      username: postgresUser.username,
      email: postgresUser.email,
      emailVerified: postgresUser.emailVerified,
      firstName: postgresUser.firstName,
      lastName: postgresUser.lastName,
      enabled: postgresUser.enabled,
      attributes: {
        department: postgresUser.department ? [postgresUser.department] : [],
        clearance_level: postgresUser.clearanceLevel ? [postgresUser.clearanceLevel.toString()] : [],
        contract_expiry_date: postgresUser.contractExpiryDate ? 
          [postgresUser.contractExpiryDate.toISOString()] : [],
        manager_id: postgresUser.managerId ? [postgresUser.managerId] : [],
        job_title: postgresUser.jobTitle ? [postgresUser.jobTitle] : [],
        business_unit: postgresUser.businessUnit ? [postgresUser.businessUnit] : [],
        territorial_jurisdiction: postgresUser.territorialJurisdiction ? 
          [postgresUser.territorialJurisdiction] : [],
        technical_expertise: postgresUser.technicalExpertise || [],
        hierarchy_level: postgresUser.hierarchyLevel ? [postgresUser.hierarchyLevel.toString()] : [],
        work_location: postgresUser.workLocation ? [postgresUser.workLocation] : [],
        employment_type: postgresUser.employmentType ? [postgresUser.employmentType] : [],
        verification_status: postgresUser.verificationStatus ? [postgresUser.verificationStatus] : [],
        risk_score: postgresUser.riskScore ? [postgresUser.riskScore.toString()] : [],
        certifications: postgresUser.certifications || [],
        phone_number: postgresUser.phoneNumber ? [postgresUser.phoneNumber] : [],
        nationality: postgresUser.nationality ? [postgresUser.nationality] : [],
        date_of_birth: postgresUser.dateOfBirth ? 
          [postgresUser.dateOfBirth.toISOString()] : [],
        gender: postgresUser.gender ? [postgresUser.gender] : [],
        ...this.expandCustomAttributes(postgresUser.customAttributes)
      }
    };
  }

  // ============================================================================
  // MÉTHODES UTILITAIRES POUR LES DONNÉES
  // ============================================================================

  private getFirstAttribute(attributes: Record<string, string[]>, key: string): string | undefined {
    const values = attributes[key];
    return values && values.length > 0 ? values[0] : undefined;
  }

  private parseDate(dateStr?: string): Date | undefined {
    if (!dateStr) return undefined;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  private extractCustomAttributes(attributes: Record<string, string[]>): any {
    const standardAttributes = new Set([
      'department', 'clearance_level', 'contract_expiry_date', 'manager_id',
      'job_title', 'business_unit', 'territorial_jurisdiction', 'technical_expertise',
      'hierarchy_level', 'work_location', 'employment_type', 'verification_status',
      'risk_score', 'certifications', 'phone_number', 'nationality', 'date_of_birth', 'gender'
    ]);

    const custom: any = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (!standardAttributes.has(key)) {
        custom[key] = value;
      }
    }

    return Object.keys(custom).length > 0 ? custom : undefined;
  }

  private expandCustomAttributes(customAttributes: any): Record<string, string[]> {
    if (!customAttributes || typeof customAttributes !== 'object') {
      return {};
    }

    const expanded: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(customAttributes)) {
      if (Array.isArray(value)) {
        expanded[key] = value.map(v => String(v));
      } else {
        expanded[key] = [String(value)];
      }
    }

    return expanded;
  }

  private generateSyncHash(data: any): string {
    const normalizedData = JSON.stringify(data, Object.keys(data).sort());
    return createHash('sha256').update(normalizedData).digest('hex');
  }

  // ============================================================================
  // MÉTHODES DE BASE DE DONNÉES
  // ============================================================================

  private async createNewUser(userData: UserCreationData, keycloakUser: KeycloakUser): Promise<any> {
    return await this.prisma.$transaction(async (tx) => {
      // Créer l'utilisateur
      const user = await this.userService.createUser(userData);

      // Synchroniser les rôles
      if (keycloakUser.realmRoles && keycloakUser.realmRoles.length > 0) {
        await this.syncUserRoles(user.id, keycloakUser.realmRoles);
      }

      // Synchroniser les groupes/organisations
      if (keycloakUser.groups && keycloakUser.groups.length > 0) {
        await this.syncUserOrganizations(user.id, keycloakUser.groups);
      }

      return user;
    });
  }

  private async updateExistingUser(userId: string, userData: UserCreationData, keycloakUser: KeycloakUser): Promise<void> {
    // Mettre à jour l'utilisateur
    await this.userService.updateUser(userId, userData);

    // Resynchroniser les rôles
    if (keycloakUser.realmRoles) {
      await this.userService.updateUserRoles(userId, keycloakUser.realmRoles, 'SYNC_SERVICE');
    }

    // Resynchroniser les organisations
    if (keycloakUser.groups) {
      await this.syncUserOrganizations(userId, keycloakUser.groups);
    }
  }

  private async syncUserRoles(userId: string, roleNames: string[]): Promise<void> {
    for (const roleName of roleNames) {
      await this.userService.assignRoleToUser(userId, roleName, 'SYNC_SERVICE');
    }
  }

  private async syncUserOrganizations(userId: string, groupNames: string[]): Promise<void> {
    for (const groupName of groupNames) {
      await this.userService.assignUserToOrganization(userId, groupName);
    }
  }

  // ============================================================================
  // SYNCHRONISATION DES RÔLES ET ORGANISATIONS
  // ============================================================================

  private async syncRolesAndOrganizations(): Promise<void> {
    try {
      // Synchroniser les rôles depuis Keycloak
      await this.syncRolesFromKeycloak();
      
      // Synchroniser les groupes/organisations depuis Keycloak
      await this.syncGroupsFromKeycloak();
      
    } catch (error) {
      this.logger.error(`Failed to sync roles and organizations: ${error.message}`);
    }
  }

  private async syncRolesFromKeycloak(): Promise<void> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    const response = await axios.get(
      `${keycloakUrl}/admin/realms/${realm}/roles`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const keycloakRoles = response.data;

    for (const keycloakRole of keycloakRoles) {
      await this.prisma.role.upsert({
        where: { name: keycloakRole.name },
        update: {
          description: keycloakRole.description,
          keycloakId: keycloakRole.id
        },
        create: {
          name: keycloakRole.name,
          description: keycloakRole.description,
          keycloakId: keycloakRole.id
        }
      });
    }
  }

  private async syncGroupsFromKeycloak(): Promise<void> {
    const axios = (await import('axios')).default;
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    const response = await axios.get(
      `${keycloakUrl}/admin/realms/${realm}/groups`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const keycloakGroups = response.data;

    for (const keycloakGroup of keycloakGroups) {
      await this.prisma.organization.upsert({
        where: { name: keycloakGroup.name },
        update: {
          keycloakId: keycloakGroup.id
        },
        create: {
          name: keycloakGroup.name,
          keycloakId: keycloakGroup.id
        }
      });
    }
  }

  // ============================================================================
  // GESTION DES LOGS DE SYNCHRONISATION
  // ============================================================================

  private async createSyncLog(
    syncType: SyncType,
    direction: SyncDirection,
    userId?: string
  ): Promise<any> {
    return await this.prisma.syncLog.create({
      data: {
        syncType,
        direction,
        status: SyncStatus.RUNNING,
        userId,
        startedAt: new Date()
      }
    });
  }

  private async completeSyncLog(
    syncLogId: string,
    status: SyncStatus,
    result?: SyncResult,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.syncLog.update({
      where: { id: syncLogId },
      data: {
        status,
        completedAt: new Date(),
        recordsCount: result?.processed || 0,
        errorMessage,
        changes: result ? {
          created: result.created,
          updated: result.updated,
          deleted: result.deleted,
          errors: result.errors.length
        } : undefined
      }
    });
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  private async initializeSyncConfiguration(): Promise<void> {
    const defaultConfigs = [
      { key: 'sync.enabled', value: 'true', description: 'Enable automatic synchronization' },
      { key: 'sync.interval_hours', value: '1', description: 'Sync interval in hours' },
      { key: 'sync.batch_size', value: '50', description: 'Batch size for sync operations' },
      { key: 'sync.auto_create_users', value: 'true', description: 'Auto-create users during sync' },
      { key: 'sync.bidirectional', value: 'true', description: 'Enable bidirectional sync' }
    ];

    for (const config of defaultConfigs) {
      await this.prisma.syncConfiguration.upsert({
        where: { key: config.key },
        update: {},
        create: config
      });
    }
  }

  // ============================================================================
  // MÉTHODES PUBLIQUES D'ADMINISTRATION
  // ============================================================================

  async getSyncStatus(): Promise<any> {
    const [lastSync, runningSync, totalUsers, syncMappings] = await Promise.all([
      this.prisma.syncLog.findFirst({
        where: { status: SyncStatus.COMPLETED },
        orderBy: { completedAt: 'desc' }
      }),
      this.prisma.syncLog.findFirst({
        where: { status: SyncStatus.RUNNING },
        orderBy: { startedAt: 'desc' }
      }),
      this.prisma.user.count(),
      this.prisma.syncMapping.count()
    ]);

    return {
      isRunning: this.isSyncing,
      lastSyncAt: lastSync?.completedAt,
      currentSync: runningSync,
      totalUsers,
      syncedUsers: syncMappings,
      syncCoverage: totalUsers > 0 ? ((syncMappings / totalUsers) * 100).toFixed(2) : 0
    };
  }

  async cancelRunningSync(): Promise<boolean> {
    if (!this.isSyncing) {
      return false;
    }

    // Marquer les syncs en cours comme annulées
    await this.prisma.syncLog.updateMany({
      where: { status: SyncStatus.RUNNING },
      data: {
        status: SyncStatus.CANCELLED,
        completedAt: new Date(),
        errorMessage: 'Sync cancelled by administrator'
      }
    });

    this.isSyncing = false;
    this.logger.warn('🛑 Sync cancelled by administrator');
    
    return true;
  }
}