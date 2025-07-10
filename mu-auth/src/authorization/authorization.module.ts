// mu-auth/src/authorization/authorization.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthorizationService } from './authorization.service';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationResolver } from './authorization.resolver';
import { PrismaModule } from '../common/prisma/prisma.module';

/**
 * Module d'autorisation simplifié utilisant smp-auth-ts
 * 
 * Fonctionnalités:
 * - Délégation vers smp-auth-ts pour OPA et Redis
 * - Intégration Prisma pour journalisation persistante
 * - Support GraphQL et gRPC
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
  ],
  controllers: [AuthorizationController],
  providers: [
    AuthorizationService,
    AuthorizationResolver
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {
  constructor() {
    console.log('🛡️ AuthorizationModule initialized with smp-auth-ts integration:');
    console.log('  ✓ OPA + Redis via smp-auth-ts');
    console.log('  ✓ Prisma logging integration');
    console.log('  ✓ GraphQL & gRPC APIs');
  }
}

