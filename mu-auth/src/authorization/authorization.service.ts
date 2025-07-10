// mu-auth/src/authorization/authorization.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { 
  createOPAClient,
  createRedisClient,
  OPAClient, 
  OPAInput, 
  OPAResult,
  RedisClient,
  LogFilter,
  OPAConfig,
  RedisConfig,
} from 'smp-auth-ts';

@Injectable()
export class AuthorizationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthorizationService.name);
  private opaClient: OPAClient;
  private redisClient: RedisClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    // Configuration OPA
    const opaConfig: OPAConfig = {
      url: this.configService.get<string>('OPA_URL', 'http://localhost:8181'),
      policyPath: this.configService.get<string>('OPA_POLICY_PATH', '/v1/data/authz/decision'),
      timeout: parseInt(this.configService.get<string>('OPA_TIMEOUT', '5000'))
    };

    // Configuration Redis
    const redisConfig: RedisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379')),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: parseInt(this.configService.get<string>('REDIS_DB', '0')),
      prefix: this.configService.get<string>('REDIS_PREFIX', 'mu:auth:')
    };

    // Créer les clients
    this.opaClient = createOPAClient(opaConfig);
    this.redisClient = createRedisClient(redisConfig);

    //await this.redisClient.connect();

    this.logger.log('AuthorizationService initialized with smp-auth-ts');
  }

  async onModuleDestroy() {
    if (this.opaClient) {
      await this.opaClient.close();
    }
    if (this.redisClient) {
      await this.redisClient.close();
    }
    this.logger.log('AuthorizationService destroyed');
  }

  // ============================================================================
  // AUTORISATION PRINCIPALE
  // ============================================================================

  async checkAccess(input: OPAInput): Promise<OPAResult> {
    try {
      const result = await this.opaClient.checkPermission(input);
      
      // Journaliser la décision dans Redis
      await this.logAuthorizationDecision(
        input.user.id,
        input.resource.id,
        input.resource.type,
        input.action,
        result.allow,
        result.reason,
        input.context
      );
      
      // Journaliser dans Prisma si disponible
      await this.logAuthorizationDecisionToPrisma(input, result);
      
      return result;
    } catch (error) {
      this.logger.error(`Error during authorization check: ${error.message}`);
      return { 
        allow: false, 
        reason: `Error: ${error.message}` 
      };
    }
  }

  async checkAccessWithToken(token: string, input: OPAInput): Promise<OPAResult> {
    try {
      // Cette méthode nécessiterait l'injection du service d'authentification
      // Pour l'instant, utiliser l'entrée OPA directement
      return this.checkAccess(input);
    } catch (error) {
      this.logger.error(`Error during token-based authorization: ${error.message}`);
      return { 
        allow: false, 
        reason: `Error: ${error.message}` 
      };
    }
  }

  // ============================================================================
  // JOURNALISATION ET HISTORIQUE
  // ============================================================================

  async getAuthorizationHistory(
    userId?: string,
    resourceId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    try {
      // Utiliser Redis pour l'historique récent
      const filter: LogFilter = {
        userId,
        resourceId,
        limit,
        offset,
        sortOrder: 'desc'
      };

      const redisResult = await this.redisClient.getAuthorizationHistory(filter);
      
      // Mapper vers le format attendu
      return redisResult.items.map(log => ({
        userId: log.userId,
        resourceId: log.resourceId,
        resourceType: log.resourceType,
        action: log.action,
        allow: log.allowed,
        reason: log.reason,
        context: log.context,
        timestamp: log.timestamp
      }));
    } catch (error) {
      this.logger.error(`Failed to get authorization history: ${error.message}`);
      
      // Fallback vers Prisma si Redis échoue
      return this.getAuthorizationHistoryFromPrisma(userId, resourceId, limit, offset);
    }
  }

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

  private async logAuthorizationDecision(
    userId: string,
    resourceId: string,
    resourceType: string,
    action: string,
    allow: boolean,
    reason?: string,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      await this.redisClient.logAuthorizationDecision({
        userId,
        resourceId,
        resourceType,
        action,
        allowed: allow,
        reason,
        context
      });
    } catch (error) {
      this.logger.error(`Failed to log authorization decision to Redis: ${error.message}`);
    }
  }

  private async logAuthorizationDecisionToPrisma(
    input: OPAInput,
    result: OPAResult
  ): Promise<void> {
    try {
      if (!this.prisma) return;

      await this.prisma.authorizationLog.create({
        data: {
          userId: input.user.id,
          resourceId: input.resource.id,
          resourceType: input.resource.type,
          action: input.action,
          allowed: result.allow,
          reason: result.reason,
          context: input.context as any
        }
      });
    } catch (error) {
      this.logger.error(`Failed to log authorization decision to Prisma: ${error.message}`);
    }
  }

  private async getAuthorizationHistoryFromPrisma(
    userId?: string,
    resourceId?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    try {
      if (!this.prisma) return [];

      const where: any = {};
      if (userId) where.userId = userId;
      if (resourceId) where.resourceId = resourceId;

      const logs = await this.prisma.authorizationLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset
      });

      return logs.map(log => ({
        userId: log.userId,
        resourceId: log.resourceId,
        resourceType: log.resourceType,
        action: log.action,
        allow: log.allowed,
        reason: log.reason,
        context: log.context,
        timestamp: log.timestamp.toISOString()
      }));
    } catch (error) {
      this.logger.error(`Failed to get authorization history from Prisma: ${error.message}`);
      return [];
    }
  }
}