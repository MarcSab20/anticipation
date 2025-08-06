// mu-auth/src/auth/oauth/oauth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OAuthController } from '../controllers/oauth.controller';
import { OAuthService } from '../services/oauth.service';
import { OAuthResolver } from '../resolvers/oauth.resolver'; // ✅ Add resolver
import { AuthModule } from '../auth.module';

@Module({
  imports: [
    ConfigModule,
    // Utiliser forwardRef pour éviter les dépendances circulaires
    // AuthModule contient des services nécessaires à OAuth
  ],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    OAuthResolver, // ✅ Add resolver to providers
  ],
  exports: [OAuthService]
})
export class OAuthModule {
  constructor() {
    console.log('🔐 OAuth Module initialized with Google and GitHub providers + GraphQL support');
  }
}