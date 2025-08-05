// mu-auth/src/auth/oauth/oauth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OAuthController } from '../controllers/oauth.controller';
import { OAuthService } from '../services/oauth.service';
import { AuthModule } from '../auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule // Pour accéder à AuthService
  ],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService]
})
export class OAuthModule {
  constructor() {
    console.log('🔐 OAuth Module initialized with Google and GitHub providers');
  }
}