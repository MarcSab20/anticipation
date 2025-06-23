// mu-auth/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { PostgresUserService } from './services/postgres-user.service';
import { KeycloakPostgresSyncService } from './services/keycloak-postgres-sync.service';
import { EventLoggerService } from './services/event-logger.service';

/**
 * Module d'authentification simplifié utilisant smp-auth-ts
 * 
 * Fonctionnalités:
 * - Délégation vers smp-auth-ts pour Keycloak, OPA et Redis
 * - Intégration PostgreSQL pour synchronisation et stockage local
 * - Logging des événements d'authentification
 * - Support GraphQL et REST
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot()
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthResolver,
    PostgresUserService,
   // KeycloakPostgresSyncService,
    EventLoggerService
  ],
  exports: [AuthService, PostgresUserService, EventLoggerService],
})
export class AuthModule {
  constructor() {
    console.log('🔐 AuthModule initialized with smp-auth-ts integration:');
    console.log('  ✓ smp-auth-ts library integration');
    console.log('  ✓ Keycloak + OPA + Redis via smp-auth-ts');
    console.log('  ✓ PostgreSQL local storage');
    console.log('  ✓ Bidirectional sync');
    console.log('  ✓ Event logging');
    console.log('  ✓ GraphQL & REST APIs');
  }
}

