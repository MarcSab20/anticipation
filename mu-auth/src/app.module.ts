// mu-auth/src/app.module.ts
import { Module } from '@nestjs/common';
import { AuthorizationModule } from './authorization/authorization.module';
import { AuthModule } from './auth/auth.module';
import { join } from 'path';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
    }),
    
    // Cache NestJS simplifié (optionnel car smp-auth-ts gère son propre cache)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD', ''),
        db: configService.get('REDIS_DB', 0),
        ttl: 300,
        prefix: configService.get('REDIS_PREFIX', 'mu:auth:') + 'nestjs:',
      }),
    }),
    
    GraphQLModule.forRoot<ApolloDriverConfig>({
      autoSchemaFile: {
        path: join(process.cwd(), 'schema.gql'),
        federation: 2
      },
      buildSchemaOptions: { dateScalarMode: 'isoDate' },
      context: ({ req }: any) => ({ req }),
      playground: true,
      driver: ApolloFederationDriver,
      introspection: true,
    }),
    
    AuthorizationModule,
    AuthModule,
  ],
  providers: [ConfigService],
})
export class AppModule {
  constructor() {
    console.log('🚀 mu-auth service initialized with smp-auth-ts integration');
  }
}