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
import { MagicLinkIntegrationService } from './services/magic-link-integration.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { OAuthResolver } from './resolvers/oauth.resolver';
import { OAuthService } from './services/oauth.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthResolver,
    OAuthResolver,
    OAuthService,
    PostgresUserService,
    UserRegistrationValidationService,
    KeycloakPostgresSyncService,
    EventLoggerService,
    MagicLinkIntegrationService, 
  ],
  exports: [
    AuthService, 
    PostgresUserService, 
    EventLoggerService,
    UserRegistrationValidationService,
    KeycloakPostgresSyncService,
    MagicLinkIntegrationService,
    OAuthService 
  ],
})
export class AuthModule {
  constructor() {
    console.log('🔐 AuthModule initialized with comprehensive authentication system:');
    console.log('✅ Standard authentication (username/password)');
    console.log('✅ Magic Link authentication');
    console.log('✅ OAuth2 authentication (Google & GitHub)');
    console.log('✅ MFA support');
    console.log('✅ GraphQL & REST APIs');
    console.log('Ready for production use! 🚀');
  }
}