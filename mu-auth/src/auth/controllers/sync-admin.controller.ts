// mu-auth/src/auth/controllers/sync-admin.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Delete,
  Body, 
  Param, 
  Query,
  HttpException, 
  HttpStatus,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { KeycloakPostgresSyncService } from '../services/keycloak-postgres-sync.service';
import { PostgresUserService } from '../services/postgres-user.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncDirection } from '@prisma/client';

// Interface pour les résultats de synchronisation
interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  errors: Array<{ id: string; error: string }>;
  duration: number;
}

// Interface pour les problèmes d'intégrité
interface IntegrityIssue {
  type: string;
  count: number;
  severity: 'error' | 'warning';
  description: string;
}

interface SyncStatusResponse {
  isRunning: boolean;
  lastSyncAt?: string;
  currentSync?: any;
  totalUsers: number;
  syncedUsers: number;
  syncCoverage: string;
}

interface SyncOperationRequest {
  dryRun?: boolean;
  batchSize?: number;
  forceUpdate?: boolean;
}

/**
 * Contrôleur d'administration pour la synchronisation Keycloak-PostgreSQL
 * Fournit une interface REST pour gérer et surveiller la synchronisation
 */
@Controller('auth/admin/sync')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class SyncAdminController {
  constructor(
    private readonly syncService: KeycloakPostgresSyncService,
    private readonly userService: PostgresUserService,
    private readonly prisma: PrismaService
  ) {}

  // ============================================================================
  // SURVEILLANCE ET STATUS
  // ============================================================================

  /**
   * Obtenir le statut global de la synchronisation
   */
  @Get('status')
  async getSyncStatus(): Promise<SyncStatusResponse> {
    try {
      const status = await this.syncService.getSyncStatus();
      
      return {
        isRunning: status.isRunning,
        lastSyncAt: status.lastSyncAt?.toISOString(),
        currentSync: status.currentSync,
        totalUsers: status.totalUsers,
        syncedUsers: status.syncedUsers,
        syncCoverage: status.syncCoverage.toString()
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get sync status: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtenir l'historique des synchronisations
   */
  @Get('history')
  async getSyncHistory(
    @Query('limit') limit: string = '50',
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    try {
      const limitNum = Math.min(parseInt(limit) || 50, 1000);
      
      const whereClause: any = {};
      if (type) whereClause.syncType = type;
      if (status) whereClause.status = status;

      const history = await this.prisma.syncLog.findMany({
        where: whereClause,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
        include: {
          user: {
            select: { username: true, email: true }
          }
        }
      });

      return {
        success: true,
        data: history,
        count: history.length
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get sync history: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Obtenir les statistiques de synchronisation
   */
  @Get('statistics')
  async getSyncStatistics() {
    try {
      const [stats, recentActivity] = await Promise.all([
        // Statistiques générales
        this.prisma.syncLog.groupBy({
          by: ['syncType', 'status'],
          _count: { id: true },
          _avg: {
            recordsCount: true
          }
        }),
        
        // Activité récente (7 derniers jours)
        this.prisma.syncLog.findMany({
          where: {
            startedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          },
          select: {
            syncType: true,
            status: true,
            startedAt: true,
            completedAt: true,
            recordsCount: true
          }
        })
      ]);

      return {
        success: true,
        data: {
          overview: stats,
          recentActivity,
          summary: {
            totalSyncs: stats.reduce((sum, s) => sum + s._count.id, 0),
            successfulSyncs: stats
              .filter(s => s.status === 'COMPLETED')
              .reduce((sum, s) => sum + s._count.id, 0),
            failedSyncs: stats
              .filter(s => s.status === 'FAILED')
              .reduce((sum, s) => sum + s._count.id, 0)
          }
        }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get sync statistics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ============================================================================
  // OPÉRATIONS DE SYNCHRONISATION
  // ============================================================================

  /**
   * Démarrer une synchronisation complète
   */
  @Post('full')
  async startFullSync(@Body() options: SyncOperationRequest = {}): Promise<{
    success: boolean;
    message: string;
    data: SyncResult;
  }> {
    try {
      const result = await this.syncService.performFullSync(options);
      
      return {
        success: true,
        message: 'Full synchronization completed',
        data: result
      };
    } catch (error) {
      throw new HttpException(
        `Full sync failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Synchroniser un utilisateur spécifique
   */
  @Post('user/:keycloakId')
  async syncSpecificUser(
    @Param('keycloakId') keycloakId: string,
    @Body() body: { direction?: SyncDirection } = {}
  ) {
    try {
      const direction = body.direction || SyncDirection.KEYCLOAK_TO_POSTGRES;
      const success = await this.syncService.syncSpecificUser(keycloakId, direction);
      
      return {
        success,
        message: success ? 'User synchronized successfully' : 'User synchronization failed',
        data: { keycloakId, direction }
      };
    } catch (error) {
      throw new HttpException(
        `User sync failed: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Annuler une synchronisation en cours
   */
  @Post('cancel')
  async cancelSync() {
    try {
      const cancelled = await this.syncService.cancelRunningSync();
      
      return {
        success: cancelled,
        message: cancelled ? 'Sync cancelled successfully' : 'No running sync to cancel'
      };
    } catch (error) {
      throw new HttpException(
        `Failed to cancel sync: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ============================================================================
  // GESTION DES MAPPINGS
  // ============================================================================

  /**
   * Obtenir les mappings de synchronisation
   */
  @Get('mappings')
  async getSyncMappings(
    @Query('limit') limit: string = '100',
    @Query('search') search?: string
  ) {
    try {
      const limitNum = Math.min(parseInt(limit) || 100, 1000);
      
      const whereClause: any = {};
      if (search) {
        whereClause.OR = [
          { keycloakUserId: { contains: search } },
          { postgresUserId: { contains: search } }
        ];
      }

      const mappings = await this.prisma.syncMapping.findMany({
        where: whereClause,
        take: limitNum,
        orderBy: { lastSyncAt: 'desc' }
      });

      return {
        success: true,
        data: mappings,
        count: mappings.length
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get sync mappings: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Supprimer un mapping spécifique
   */
  @Delete('mappings/:id')
  async deleteSyncMapping(@Param('id') id: string) {
    try {
      await this.prisma.syncMapping.delete({
        where: { id }
      });

      return {
        success: true,
        message: 'Sync mapping deleted successfully'
      };
    } catch (error) {
      throw new HttpException(
        `Failed to delete sync mapping: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Recréer tous les mappings
   */
  @Post('mappings/rebuild')
  async rebuildMappings(): Promise<{
    success: boolean;
    message: string;
    data: SyncResult;
  }> {
    try {
      // Supprimer tous les mappings existants
      await this.prisma.syncMapping.deleteMany({});
      
      // Déclencher une synchronisation complète pour recréer les mappings
      const result = await this.syncService.performFullSync({ forceUpdate: true });
      
      return {
        success: true,
        message: 'Mappings rebuilt successfully',
        data: result
      };
    } catch (error) {
      throw new HttpException(
        `Failed to rebuild mappings: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Obtenir la configuration de synchronisation
   */
  @Get('config')
  async getSyncConfig() {
    try {
      const configs = await this.prisma.syncConfiguration.findMany({
        orderBy: { key: 'asc' }
      });

      const configMap = configs.reduce((acc, config) => {
        acc[config.key] = {
          value: config.value,
          description: config.description,
          updatedAt: config.updatedAt
        };
        return acc;
      }, {} as Record<string, any>);

      return {
        success: true,
        data: configMap
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get sync config: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Mettre à jour la configuration de synchronisation
   */
  @Post('config')
  async updateSyncConfig(@Body() configUpdates: Record<string, string>) {
    try {
      const updates: Promise<any>[] = [];
      
      for (const [key, value] of Object.entries(configUpdates)) {
        updates.push(
          this.prisma.syncConfiguration.upsert({
            where: { key },
            update: { 
              value,
              updatedAt: new Date()
            },
            create: { 
              key,
              value,
              updatedAt: new Date()
            }
          })
        );
      }

      await Promise.all(updates);

      return {
        success: true,
        message: 'Sync configuration updated successfully'
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update sync config: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // ============================================================================
  // MAINTENANCE ET NETTOYAGE
  // ============================================================================

  /**
   * Nettoyer les anciens logs de synchronisation
   */
  @Delete('logs/cleanup')
  async cleanupOldLogs(@Query('days') days: string = '30') {
    try {
      const daysNum = parseInt(days) || 30;
      const cutoffDate = new Date(Date.now() - (daysNum * 24 * 60 * 60 * 1000));
      
      const result = await this.prisma.syncLog.deleteMany({
        where: {
          startedAt: { lt: cutoffDate },
          status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] }
        }
      });
      
      return {
        success: true,
        message: `Cleaned up ${result.count} old sync logs`,
        data: { deletedCount: result.count, retentionDays: daysNum }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to cleanup logs: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Analyser et résoudre les conflits de synchronisation
   */
  @Get('conflicts')
  async analyzeConflicts() {
    try {
      // Trouver les utilisateurs avec des incohérences
      const conflicts = await this.prisma.$queryRaw`
        SELECT 
          u.id as postgres_id,
          u.keycloak_id,
          u.username,
          u.email,
          u.updated_timestamp as postgres_updated,
          sm.keycloak_updated_at,
          sm.last_sync_at,
          CASE 
            WHEN u.updated_timestamp > sm.last_sync_at THEN 'postgres_newer'
            WHEN sm.keycloak_updated_at > sm.last_sync_at THEN 'keycloak_newer'
            ELSE 'in_sync'
          END as conflict_type
        FROM users u
        LEFT JOIN sync_mappings sm ON u.keycloak_id = sm.keycloak_user_id
        WHERE (
          u.updated_timestamp > sm.last_sync_at OR
          sm.keycloak_updated_at > sm.last_sync_at
        )
        AND u.keycloak_id IS NOT NULL
        ORDER BY u.updated_timestamp DESC
      `;

      // Trouver les utilisateurs orphelins (sans mapping)
      const orphanedUsers = await this.prisma.user.findMany({
        where: {
          keycloakId: { not: null },
          id: {
            notIn: await this.prisma.syncMapping.findMany({
              select: { postgresUserId: true }
            }).then(mappings => mappings.map(m => m.postgresUserId))
          }
        },
        select: {
          id: true,
          keycloakId: true,
          username: true,
          email: true,
          updatedTimestamp: true
        }
      });

      return {
        success: true,
        data: {
          conflicts,
          orphanedUsers,
          summary: {
            totalConflicts: Array.isArray(conflicts) ? conflicts.length : 0,
            orphanedUsers: orphanedUsers.length,
            needsAttention: (Array.isArray(conflicts) ? conflicts.length : 0) + orphanedUsers.length
          }
        }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to analyze conflicts: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Résoudre automatiquement les conflits simples
   */
  @Post('conflicts/resolve')
  async resolveConflicts(@Body() body: { 
    strategy: 'keycloak_wins' | 'postgres_wins' | 'newest_wins';
    userIds?: string[];
  }) {
    try {
      const { strategy, userIds } = body;
      let resolvedCount = 0;
      
      // Si des IDs spécifiques sont fournis, ne traiter que ceux-ci
      const whereClause = userIds ? { id: { in: userIds } } : {};
      
      const conflictedUsers = await this.prisma.user.findMany({
        where: {
          ...whereClause,
          keycloakId: { not: null }
        }
      });

      for (const user of conflictedUsers) {
        if (user.keycloakId) {
          try {
            await this.syncService.syncSpecificUser(
              user.keycloakId,
              strategy === 'postgres_wins' 
                ? SyncDirection.POSTGRES_TO_KEYCLOAK 
                : SyncDirection.KEYCLOAK_TO_POSTGRES
            );
            resolvedCount++;
          } catch (error) {
            console.error(`Failed to resolve conflict for user ${user.id}:`, error);
          }
        }
      }

      return {
        success: true,
        message: `Resolved ${resolvedCount} conflicts using strategy: ${strategy}`,
        data: { resolvedCount, strategy }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to resolve conflicts: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ============================================================================
  // TESTS ET DIAGNOSTICS
  // ============================================================================

  /**
   * Effectuer un test de synchronisation à sec
   */
  @Post('test/dry-run')
  async performDryRun(@Body() options: { batchSize?: number } = {}): Promise<{
    success: boolean;
    message: string;
    data: SyncResult;
  }> {
    try {
      const result = await this.syncService.performFullSync({
        dryRun: true,
        batchSize: options.batchSize || 10
      });

      return {
        success: true,
        message: 'Dry run completed successfully',
        data: result
      };
    } catch (error) {
      throw new HttpException(
        `Dry run failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Valider l'intégrité des données
   */
  @Get('validate/integrity')
  async validateDataIntegrity() {
    try {
      const issues: IntegrityIssue[] = [];

      // Vérifier les utilisateurs sans mapping
      const usersWithoutMapping = await this.prisma.user.count({
        where: {
          keycloakId: { not: null },
          id: {
            notIn: await this.prisma.syncMapping.findMany({
              select: { postgresUserId: true }
            }).then(mappings => mappings.map(m => m.postgresUserId))
          }
        }
      });

      if (usersWithoutMapping > 0) {
        issues.push({
          type: 'missing_mappings',
          count: usersWithoutMapping,
          severity: 'warning',
          description: 'Users with Keycloak ID but no sync mapping'
        });
      }

      // Vérifier les mappings orphelins
      const orphanedMappings = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM sync_mappings sm
        LEFT JOIN users u ON sm.postgres_user_id = u.id
        WHERE u.id IS NULL
      `;

      const orphanedCount = Array.isArray(orphanedMappings) && orphanedMappings.length > 0 
        ? Number(orphanedMappings[0]?.count || 0) 
        : 0;

      if (orphanedCount > 0) {
        issues.push({
          type: 'orphaned_mappings',
          count: orphanedCount,
          severity: 'error',
          description: 'Sync mappings pointing to non-existent users'
        });
      }

      // Vérifier les doublons d'email
      const duplicateEmails = await this.prisma.user.groupBy({
        by: ['email'],
        having: {
          email: {
            _count: {
              gt: 1
            }
          }
        },
        _count: { email: true }
      });

      if (duplicateEmails.length > 0) {
        issues.push({
          type: 'duplicate_emails',
          count: duplicateEmails.length,
          severity: 'error',
          description: 'Multiple users with the same email address'
        });
      }

      return {
        success: true,
        data: {
          issues,
          summary: {
            totalIssues: issues.length,
            hasErrors: issues.some(i => i.severity === 'error'),
            hasWarnings: issues.some(i => i.severity === 'warning'),
            isHealthy: issues.length === 0
          }
        }
      };
    } catch (error) {
      throw new HttpException(
        `Integrity validation failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ============================================================================
  // GESTION DES UTILISATEURS
  // ============================================================================

  /**
   * Obtenir les utilisateurs synchronisés
   */
  @Get('users')
  async getSyncedUsers(
    @Query('limit') limit: string = '50',
    @Query('offset') offset: string = '0',
    @Query('search') search?: string
  ) {
    try {
      const limitNum = Math.min(parseInt(limit) || 50, 1000);
      const offsetNum = parseInt(offset) || 0;

      const searchOptions = search ? {
        searchTerm: search,
        limit: limitNum,
        offset: offsetNum
      } : {
        limit: limitNum,
        offset: offsetNum
      };

      const result = await this.userService.searchUsers(searchOptions);

      return {
        success: true,
        data: result.users,
        total: result.total,
        hasMore: result.hasMore,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total: result.total
        }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to get synced users: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Forcer la synchronisation d'un utilisateur par son ID PostgreSQL
   */
  @Post('users/:userId/sync')
  async forceSyncUser(
    @Param('userId') userId: string,
    @Body() body: { direction?: SyncDirection } = {}
  ) {
    try {
      // Récupérer l'utilisateur PostgreSQL
      const user = await this.userService.getUserById(userId);
      if (!user || !user.keycloakId) {
        throw new HttpException(
          'User not found or has no Keycloak ID',
          HttpStatus.NOT_FOUND
        );
      }

      const direction = body.direction || SyncDirection.KEYCLOAK_TO_POSTGRES;
      const success = await this.syncService.syncSpecificUser(user.keycloakId, direction);
      
      return {
        success,
        message: success ? 'User synchronized successfully' : 'User synchronization failed',
        data: { userId, keycloakId: user.keycloakId, direction }
      };
    } catch (error) {
      throw new HttpException(
        `Failed to sync user: ${error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}

// ============================================================================
// DTOs POUR LA VALIDATION
// ============================================================================

export class SyncConfigUpdateDto {
  [key: string]: string;
}

export class ConflictResolutionDto {
  strategy: 'keycloak_wins' | 'postgres_wins' | 'newest_wins';
  userIds?: string[];
}

export class SyncUserDto {
  direction?: SyncDirection;
}