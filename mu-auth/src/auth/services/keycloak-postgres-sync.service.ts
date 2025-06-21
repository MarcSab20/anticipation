import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth.service';
import { PostgresUserService } from './postgres-user.service';
import axios from 'axios';

@Injectable()
export class KeycloakPostgresSyncService implements OnModuleInit {
  private readonly logger = new Logger(KeycloakPostgresSyncService.name);
  private adminToken: string  = "vide";
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly postgresUserService: PostgresUserService
  ) {}

  async onModuleInit() {
   // Attendre que AuthService soit initialisé
    setTimeout(async () => {
      try {
        await this.syncUsersFromKeycloakToPostgres();
      } catch (error) {
        this.logger.warn(`Initial sync failed: ${error.message}`);
      }
    }, 5000); // Attendre 5 secondes
  }

  private async getKeycloakAdminToken(): Promise<string> {
    if (this.adminToken && Date.now() < this.tokenExpiresAt) {
      return this.adminToken;
    }

    const response = await this.authService.getClientCredentialsToken();
    this.adminToken = response.access_token;
    this.tokenExpiresAt = Date.now() + (response.expires_in * 1000) - 30000; // 30s de marge

    return this.adminToken ;
  }

  private async getKeycloakUsers(max: number = 100, first: number = 0): Promise<any[]> {
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    const response = await axios.get(
      `${keycloakUrl}/admin/realms/${realm}/users`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { max, first }
      }
    );

    return response.data;
  }

  async syncUsersFromKeycloakToPostgres(): Promise<void> {
    this.logger.log('Synchronisation des utilisateurs Keycloak vers PostgreSQL...');
    
    try {
      let first = 0;
      const max = 100;
      let hasMore = true;

      while (hasMore) {
        const keycloakUsers = await this.getKeycloakUsers(max, first);
        
        if (keycloakUsers.length === 0) {
          hasMore = false;
          break;
        }

        for (const kcUser of keycloakUsers) {
          await this.syncUserToPostgres(kcUser);
        }

        first += max;
        hasMore = keycloakUsers.length === max;
      }

      this.logger.log('Synchronisation terminée avec succès');
    } catch (error) {
      this.logger.error('Erreur lors de la synchronisation:', error.message);
    }
  }

  private async syncUserToPostgres(keycloakUser: any): Promise<void> {
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await this.postgresUserService.getUserByUsername(keycloakUser.username);
      
      const userData = this.mapKeycloakUserToPostgres(keycloakUser);

      if (existingUser) {
        // Mettre à jour l'utilisateur existant
        await this.postgresUserService.updateUser(existingUser.id, userData);
      } else {
        // Créer un nouvel utilisateur
        const newUser = await this.postgresUserService.createUser(userData);
        
        // Synchroniser les rôles
        await this.syncUserRoles(keycloakUser, newUser.id);
      }
    } catch (error) {
      this.logger.error(`Erreur lors de la synchronisation de l'utilisateur ${keycloakUser.username}:`, error.message);
    }
  }

  private mapKeycloakUserToPostgres(kcUser: any): Partial<any> {
    return {
      username: kcUser.username,
      email: kcUser.email,
      email_verified: kcUser.emailVerified || false,
      first_name: kcUser.firstName,
      last_name: kcUser.lastName,
      enabled: kcUser.enabled !== false,
      department: kcUser.attributes?.department?.[0],
      clearance_level: parseInt(kcUser.attributes?.clearance_level?.[0]) || 1,
      job_title: kcUser.attributes?.job_title?.[0],
      business_unit: kcUser.attributes?.business_unit?.[0],
      territorial_jurisdiction: kcUser.attributes?.territorial_jurisdiction?.[0],
      hierarchy_level: parseInt(kcUser.attributes?.hierarchy_level?.[0]) || 1,
      work_location: kcUser.attributes?.work_location?.[0],
      employment_type: kcUser.attributes?.employment_type?.[0] || 'PERMANENT',
      verification_status: kcUser.attributes?.verification_status?.[0] || 'PENDING',
      risk_score: parseInt(kcUser.attributes?.risk_score?.[0]) || 0,
      phone_number: kcUser.attributes?.phone_number?.[0],
      nationality: kcUser.attributes?.nationality?.[0],
      gender: kcUser.attributes?.gender?.[0],
      state: kcUser.enabled ? 'ACTIVE' : 'INACTIVE'
    };
  }

  private async syncUserRoles(keycloakUser: any, postgresUserId: string): Promise<void> {
    // Récupérer les rôles de l'utilisateur depuis Keycloak
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    try {
      const rolesResponse = await axios.get(
        `${keycloakUrl}/admin/realms/${realm}/users/${keycloakUser.id}/role-mappings/realm`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      for (const role of rolesResponse.data) {
        await this.postgresUserService.assignRoleToUser(postgresUserId, role.name);
      }
    } catch (error) {
      this.logger.error(`Erreur lors de la synchronisation des rôles pour ${keycloakUser.username}:`, error.message);
    }
  }

  // Synchronisation périodique (toutes les heures)
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledSync(): Promise<void> {
    if (this.configService.get('ENABLE_AUTO_SYNC', true)) {
      await this.syncUsersFromKeycloakToPostgres();
    }
  }

  async syncUserFromPostgresToKeycloak(postgresUser: any): Promise<void> {
    // Méthode pour synchroniser dans l'autre sens si nécessaire
    this.logger.log(`Synchronisation de ${postgresUser.username} vers Keycloak`);
    
    const token = await this.getKeycloakAdminToken();
    const keycloakUrl = this.configService.get('KEYCLOAK_URL');
    const realm = this.configService.get('KEYCLOAK_REALM');

    const keycloakUserData = {
      username: postgresUser.username,
      email: postgresUser.email,
      emailVerified: postgresUser.email_verified,
      firstName: postgresUser.first_name,
      lastName: postgresUser.last_name,
      enabled: postgresUser.enabled,
      attributes: {
        department: [postgresUser.department],
        clearance_level: [postgresUser.clearance_level?.toString()],
        job_title: [postgresUser.job_title],
        business_unit: [postgresUser.business_unit],
        territorial_jurisdiction: [postgresUser.territorial_jurisdiction],
        hierarchy_level: [postgresUser.hierarchy_level?.toString()],
        work_location: [postgresUser.work_location],
        employment_type: [postgresUser.employment_type],
        verification_status: [postgresUser.verification_status],
        risk_score: [postgresUser.risk_score?.toString()]
      }
    };

    try {
      await axios.post(
        `${keycloakUrl}/admin/realms/${realm}/users`,
        keycloakUserData,
        {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      this.logger.log(`Utilisateur ${postgresUser.username} synchronisé vers Keycloak`);
    } catch (error) {
      this.logger.error(`Erreur lors de la synchronisation vers Keycloak:`, error.message);
    }
  }
}