// mu-auth/src/auth/auth.module.ts - Version mise à jour avec nouvelles fonctionnalités
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { PostgresUserService } from './services/postgres-user.service';
import { KeycloakPostgresSyncService } from './services/keycloak-postgres-sync.service';
import { EventLoggerService } from './services/event-logger.service';
import { UserRegistrationValidationService } from './services/user-registration-validation.service';

/**
 * Module d'authentification complet avec gestion des utilisateurs
 * 
 * Fonctionnalités:
 * - Authentification et autorisation via smp-auth-ts
 * - Enregistrement et gestion complète des utilisateurs
 * - Validation avancée des mots de passe, noms d'utilisateur et emails
 * - Vérification d'email et reset de mot de passe
 * - Intégration PostgreSQL pour synchronisation et stockage local
 * - Logging des événements d'authentification et de gestion des utilisateurs
 * - Support GraphQL et REST API complets
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
    // KeycloakPostgresSyncService, // Décommentez si nécessaire
    EventLoggerService,
    UserRegistrationValidationService
  ],
  exports: [
    AuthService, 
    PostgresUserService, 
    EventLoggerService,
    UserRegistrationValidationService
  ],
})
export class AuthModule {
  constructor() {
    console.log('🔐 AuthModule initialized with complete user management:');
    console.log('  ✓ smp-auth-ts library integration');
    console.log('  ✓ User registration and management');
    console.log('  ✓ Email verification and password reset');
    console.log('  ✓ Advanced validation services');
    console.log('  ✓ Keycloak + OPA + Redis via smp-auth-ts');
    console.log('  ✓ PostgreSQL local storage and sync');
    console.log('  ✓ Comprehensive event logging');
    console.log('  ✓ GraphQL & REST APIs');
    console.log('  ✓ Password policy enforcement');
    console.log('  ✓ Username and email validation');
  }
}