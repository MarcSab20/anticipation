// mu-auth/src/common/common.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OAuthStartupCheckService } from './startup/oauth-check-service';

@Module({
  imports: [ConfigModule],
  providers: [OAuthStartupCheckService],
  exports: [OAuthStartupCheckService]
})
export class CommonModule {}