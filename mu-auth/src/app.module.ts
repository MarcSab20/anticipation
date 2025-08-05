// mu-auth/src/app.module.ts
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
import { existsSync } from 'fs';

@Module({
  imports: [
    // ✅ CORRECTION PRINCIPALE: Configuration améliorée des fichiers .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: (() => {
        // Détecter l'environnement
        const nodeEnv = process.env.NODE_ENV || 'local';
        
        // Définir les fichiers .env par ordre de priorité
        const envFiles = [
          `.env.${nodeEnv}`,     // .env.development, .env.production, etc.
          '.env.local',          // Fichier local spécifique
          '.env'                 // Fichier par défaut
        ];
        
        // Filtrer les fichiers qui existent réellement
        const existingFiles = envFiles.filter(file => existsSync(file));
        
        console.log('🔍 NODE_ENV:', nodeEnv);
        console.log('🔍 Fichiers .env recherchés:', envFiles);
        console.log('🔍 Fichiers .env trouvés:', existingFiles);
        
        return existingFiles.length > 0 ? existingFiles : ['.env'];
      })(),
      // ✅ Activer l'expansion des variables
      expandVariables: true,
      // ✅ Ignorer les erreurs si les fichiers n'existent pas
      ignoreEnvFile: false,
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
  constructor(private readonly configService: ConfigService) {
    // ✅ DEBUG: Afficher les variables critiques au démarrage
    this.debugCriticalVariables();
    
    console.log('🚀 mu-auth service initialized with session management');
  }

  // ✅ NOUVELLE MÉTHODE: Debug des variables critiques
  private debugCriticalVariables(): void {
    console.log('🔍 =================================');
    console.log('🔍 VARIABLES D\'ENVIRONNEMENT CRITIQUES');
    console.log('🔍 =================================');
    
    const criticalVars = [
      'NODE_ENV',
      'MAILJET_API_KEY',
      'MAILJET_API_SECRET', 
      'MAILJET_FROM_EMAIL',
      'EMAIL_PROVIDER',
      'MAGIC_LINK_ENABLED',
      'FRONTEND_URL',
      'KEYCLOAK_URL',
      'REDIS_HOST'
    ];

    criticalVars.forEach(varName => {
      const value = this.configService.get(varName);
      const status = value ? '✅' : '❌';
      const displayValue = value ? 
        (varName.includes('SECRET') || varName.includes('KEY') ? 
          `${value.toString().substring(0, 8)}...` : value) : 
        'NON DÉFINIE';
      
      console.log(`🔍 ${varName}: ${status} ${displayValue}`);
    });
    
    console.log('🔍 =================================');
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionMiddleware)
      .forRoutes('*'); 
  }
}