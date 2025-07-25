import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { SessionModule } from './session/session.module'; 
import { SessionMiddleware } from './session/session.middleware'; 
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
    }),
    
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
    
    AuthModule,
    AuthorizationModule,
    SessionModule, 
  ],
  providers: [ConfigService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionMiddleware)
      .forRoutes('*'); 
  }
  
  constructor() {
    console.log('🚀 mu-auth service initialized with session management');
  }
}
