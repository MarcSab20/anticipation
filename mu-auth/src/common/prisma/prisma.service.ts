import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.get('POSTGRES_DATABASE_URL')
        }
      },
      log: ['query', 'info', 'warn', 'error'],
    });
  }

  async onModuleInit() {
    try {
      // Vérifier si le mode sans base de données est activé
      const skipDb = this.configService.get('SKIP_DB') === 'true';
      if (skipDb) {
        this.logger.warn('Skipping database connection as SKIP_DB=true');
        return;
      }

      await this.$connect();
      this.connected = true;
      this.logger.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      this.logger.error(`❌ Failed to connect to PostgreSQL database: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Fail fast si la DB est requise
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      try {
        await this.$disconnect();
        this.logger.log('✅ Disconnected from PostgreSQL database');
      } catch (error) {
        this.logger.error(`❌ Error during PostgreSQL disconnection: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Méthode utilitaire pour les transactions
  async executeTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(fn);
  }

  // Méthode utilitaire pour les requêtes avec retry
  async withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Database operation failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError!;
  }
}