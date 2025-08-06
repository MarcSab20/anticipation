// mu-auth/src/app.module.ts - Version complète avec OAuth
import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { SessionModule } from './session/session.module'; 
import { SessionMiddleware } from './session/session.middleware'; 
import { OAuthStartupCheckService } from './common/startup/oauth-check-service'; // ✅ OAuth startup check
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { join } from 'path';
import { existsSync } from 'fs';

@Module({
  imports: [
    // ✅ CORRECTION PRINCIPALE: Configuration améliorée des fichiers .env avec validation OAuth
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
    
    AuthModule,      // ✅ AuthModule contient maintenant OAuth
    AuthorizationModule,
    SessionModule, 
  ],
  providers: [
    ConfigService,
    OAuthStartupCheckService, // ✅ Service de vérification OAuth au démarrage
  ],
})
export class AppModule {
  constructor(
    private readonly configService: ConfigService,
    private readonly oauthCheck: OAuthStartupCheckService // ✅ Injection OAuth check
  ) {
    // ✅ DEBUG: Afficher les variables critiques au démarrage (incluant OAuth)
    this.debugCriticalVariables();
    
    console.log('🚀 mu-auth service initialized with comprehensive authentication:');
    console.log('  ✅ Standard authentication (username/password)');
    console.log('  ✅ Magic Link authentication');
    console.log('  ✅ OAuth2 authentication (Google & GitHub)');
    console.log('  ✅ MFA support');
    console.log('  ✅ Session management');
    console.log('  ✅ GraphQL & REST APIs');
  }

  // ✅ NOUVELLE MÉTHODE: Debug des variables critiques avec OAuth
  private debugCriticalVariables(): void {
    console.log('🔍 =================================');
    console.log('🔍 VARIABLES D\'ENVIRONNEMENT CRITIQUES');
    console.log('🔍 =================================');
    
    const criticalVars = [
      'NODE_ENV',
      
      // Keycloak
      'KEYCLOAK_URL',
      'KEYCLOAK_REALM',
      'KEYCLOAK_CLIENT_ID',
      'KEYCLOAK_CLIENT_SECRET',
      
      // Redis
      'REDIS_HOST',
      'REDIS_PORT',
      
      // Email (Mailjet)
      'EMAIL_PROVIDER',
      'MAILJET_API_KEY',
      'MAILJET_API_SECRET', 
      'MAILJET_FROM_EMAIL',
      
      // Magic Link
      'MAGIC_LINK_ENABLED',
      
      // OAuth Google
      'GOOGLE_OAUTH_ENABLED',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
      
      // OAuth GitHub
      'GITHUB_OAUTH_ENABLED',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'GITHUB_REDIRECT_URI',
      
      // URLs
      'FRONTEND_URL',
      'API_URL'
    ];

    criticalVars.forEach(varName => {
      const value = this.configService.get(varName);
      const status = value ? '✅' : '❌';
      
      let displayValue: string;
      if (!value) {
        displayValue = 'NON DÉFINIE';
      } else if (varName.includes('SECRET') || varName.includes('KEY') || varName.includes('PASSWORD')) {
        displayValue = `${value.toString().substring(0, 8)}...`;
      } else if (varName.includes('CLIENT_ID') && value.toString().length > 20) {
        displayValue = `${value.toString().substring(0, 15)}...`;
      } else {
        displayValue = value.toString();
      }
      
      console.log(`🔍 ${varName}: ${status} ${displayValue}`);
    });
    
    // ✅ Section spéciale OAuth
    console.log('🔍 ---------------------------------');
    console.log('🔍 OAUTH STATUS:');
    
    const googleEnabled = this.configService.get<boolean>('GOOGLE_OAUTH_ENABLED', false);
    const githubEnabled = this.configService.get<boolean>('GITHUB_OAUTH_ENABLED', false);
    const googleConfigured = !!(this.configService.get('GOOGLE_CLIENT_ID') && this.configService.get('GOOGLE_CLIENT_SECRET'));
    const githubConfigured = !!(this.configService.get('GITHUB_CLIENT_ID') && this.configService.get('GITHUB_CLIENT_SECRET'));
    
    console.log(`🔍 Google OAuth: ${googleEnabled ? '✅ ENABLED' : '❌ DISABLED'} ${googleConfigured ? '(CONFIGURED)' : '(NOT CONFIGURED)'}`);
    console.log(`🔍 GitHub OAuth: ${githubEnabled ? '✅ ENABLED' : '❌ DISABLED'} ${githubConfigured ? '(CONFIGURED)' : '(NOT CONFIGURED)'}`);
    
    if ((googleEnabled && !googleConfigured) || (githubEnabled && !githubConfigured)) {
      console.log('🔍 ⚠️ Some OAuth providers are enabled but not configured!');
    }
    
    console.log('🔍 =================================');
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionMiddleware)
      .forRoutes('*'); 
  }
}