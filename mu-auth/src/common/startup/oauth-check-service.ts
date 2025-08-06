// mu-auth/src/common/startup/oauth-check.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OAuthProviderCheck {
  name: string;
  enabled: boolean;
  configured: boolean;
  issues: string[];
  requiredVars: string[];
  optionalVars: string[];
}

@Injectable()
export class OAuthStartupCheckService implements OnModuleInit {
  private readonly logger = new Logger(OAuthStartupCheckService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('🔍 Starting OAuth configuration check...');
    
    const checks = await this.performOAuthChecks();
    this.logResults(checks);
    
    const enabledCount = checks.filter(check => check.enabled && check.configured).length;
    
    if (enabledCount === 0) {
      this.logger.warn('⚠️ No OAuth providers are configured. OAuth functionality will be disabled.');
      this.logger.warn('🔧 To enable OAuth, configure at least one provider:');
      this.logger.warn('   - Google: Set GOOGLE_OAUTH_ENABLED=true, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
      this.logger.warn('   - GitHub: Set GITHUB_OAUTH_ENABLED=true, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET');
    } else {
      this.logger.log(`✅ OAuth startup check completed. ${enabledCount} provider(s) configured.`);
    }
  }

  private async performOAuthChecks(): Promise<OAuthProviderCheck[]> {
    return [
      await this.checkGoogleProvider(),
      await this.checkGitHubProvider()
    ];
  }

  private async checkGoogleProvider(): Promise<OAuthProviderCheck> {
    const name = 'Google';
    const enabled = this.configService.get<boolean>('GOOGLE_OAUTH_ENABLED', false);
    const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
    const optionalVars = ['GOOGLE_REDIRECT_URI', 'GOOGLE_SCOPES', 'GOOGLE_HOSTED_DOMAIN'];
    const issues: string[] = [];

    // Vérifier les variables requises
    const missingRequired = requiredVars.filter(varName => !this.configService.get(varName));
    if (missingRequired.length > 0) {
      issues.push(`Missing required variables: ${missingRequired.join(', ')}`);
    }

    // Vérifications spécifiques à Google
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    if (enabled && clientId && !clientId.includes('.apps.googleusercontent.com')) {
      issues.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
    }

    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '');
    if (enabled && clientSecret && !clientSecret.startsWith('GOCSPX-')) {
      issues.push('GOOGLE_CLIENT_SECRET should start with GOCSPX-');
    }

    // Vérifier l'URI de redirection
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');
    if (enabled && !redirectUri) {
      const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
      issues.push(`GOOGLE_REDIRECT_URI not set, will use default: ${apiUrl}/auth/oauth/callback/google`);
    }

    const configured = enabled && missingRequired.length === 0;

    return {
      name,
      enabled,
      configured,
      issues,
      requiredVars,
      optionalVars
    };
  }

  private async checkGitHubProvider(): Promise<OAuthProviderCheck> {
    const name = 'GitHub';
    const enabled = this.configService.get<boolean>('GITHUB_OAUTH_ENABLED', false);
    const requiredVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
    const optionalVars = ['GITHUB_REDIRECT_URI', 'GITHUB_SCOPES', 'GITHUB_ORGANIZATION_ID', 'GITHUB_TEAM_ID'];
    const issues: string[] = [];

    // Vérifier les variables requises
    const missingRequired = requiredVars.filter(varName => !this.configService.get(varName));
    if (missingRequired.length > 0) {
      issues.push(`Missing required variables: ${missingRequired.join(', ')}`);
    }

    // Vérifications spécifiques à GitHub
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID', '');
    if (enabled && clientId && clientId.length < 20) {
      issues.push('GITHUB_CLIENT_ID seems too short (should be ~20 characters)');
    }

    const clientSecret = this.configService.get<string>('GITHUB_CLIENT_SECRET', '');
    if (enabled && clientSecret && clientSecret.length < 40) {
      issues.push('GITHUB_CLIENT_SECRET seems too short (should be ~40 characters)');
    }

    // Vérifier l'URI de redirection
    const redirectUri = this.configService.get<string>('GITHUB_REDIRECT_URI');
    if (enabled && !redirectUri) {
      const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
      issues.push(`GITHUB_REDIRECT_URI not set, will use default: ${apiUrl}/auth/oauth/callback/github`);
    }

    // Vérifier la configuration d'organisation
    const orgId = this.configService.get<string>('GITHUB_ORGANIZATION_ID');
    const teamId = this.configService.get<string>('GITHUB_TEAM_ID');
    if (enabled && teamId && !orgId) {
      issues.push('GITHUB_TEAM_ID is set but GITHUB_ORGANIZATION_ID is missing');
    }

    const configured = enabled && missingRequired.length === 0;

    return {
      name,
      enabled,
      configured,
      issues,
      requiredVars,
      optionalVars
    };
  }

  private logResults(checks: OAuthProviderCheck[]): void {
    this.logger.log('🔍 ===============================================');
    this.logger.log('🔍 OAUTH CONFIGURATION CHECK RESULTS');
    this.logger.log('🔍 ===============================================');

    for (const check of checks) {
      const status = check.enabled && check.configured ? '✅ READY' : 
                    check.enabled ? '🔶 ENABLED BUT NOT CONFIGURED' : '❌ DISABLED';
      
      this.logger.log(`🔍 ${check.name}: ${status}`);

      if (check.enabled) {
        // Log des variables requises
        for (const varName of check.requiredVars) {
          const value = this.configService.get<string>(varName);
          const varStatus = value ? '✅' : '❌';
          const displayValue = value ? 
            (varName.includes('SECRET') ? `${value.substring(0, 8)}...` : 
             varName.includes('CLIENT_ID') ? `${value.substring(0, 10)}...` : value) : 
            'NOT SET';
          
          this.logger.log(`🔍   ${varName}: ${varStatus} ${displayValue}`);
        }

        // Log des variables optionnelles configurées
        for (const varName of check.optionalVars) {
          const value = this.configService.get<string>(varName);
          if (value) {
            this.logger.log(`🔍   ${varName}: ✅ ${value}`);
          }
        }

        // Log des problèmes
        if (check.issues.length > 0) {
          this.logger.warn(`🔍   Issues:`);
          for (const issue of check.issues) {
            this.logger.warn(`🔍   - ${issue}`);
          }
        }
      }
      
      this.logger.log('🔍 -----------------------------------------------');
    }

    // Résumé global
    const totalEnabled = checks.filter(c => c.enabled).length;
    const totalConfigured = checks.filter(c => c.enabled && c.configured).length;
    const totalIssues = checks.reduce((sum, c) => sum + c.issues.length, 0);

    this.logger.log('🔍 SUMMARY:');
    this.logger.log(`🔍 - Providers enabled: ${totalEnabled}/${checks.length}`);
    this.logger.log(`🔍 - Providers configured: ${totalConfigured}/${totalEnabled}`);
    this.logger.log(`🔍 - Total issues: ${totalIssues}`);

    if (totalConfigured === 0 && totalEnabled > 0) {
      this.logger.warn('🔍 ⚠️ OAuth providers are enabled but not properly configured!');
      this.logConfigurationHelp();
    } else if (totalConfigured === 0) {
      this.logger.log('🔍 💡 To enable OAuth, set the appropriate environment variables and restart.');
    }

    this.logger.log('🔍 ===============================================');
  }

  private logConfigurationHelp(): void {
    this.logger.log('🔧 CONFIGURATION HELP:');
    this.logger.log('🔧 ');
    this.logger.log('🔧 For Google OAuth:');
    this.logger.log('🔧 1. Go to https://console.cloud.google.com/');
    this.logger.log('🔧 2. Create or select a project');
    this.logger.log('🔧 3. Enable Google+ API or People API');
    this.logger.log('🔧 4. Create OAuth 2.0 credentials');
    this.logger.log('🔧 5. Set environment variables:');
    this.logger.log('🔧    GOOGLE_OAUTH_ENABLED=true');
    this.logger.log('🔧    GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com');
    this.logger.log('🔧    GOOGLE_CLIENT_SECRET=GOCSPX-your-secret');
    this.logger.log('🔧 ');
    this.logger.log('🔧 For GitHub OAuth:');
    this.logger.log('🔧 1. Go to https://github.com/settings/developers');
    this.logger.log('🔧 2. Create a new OAuth App');
    this.logger.log('🔧 3. Configure redirect URL');
    this.logger.log('🔧 4. Set environment variables:');
    this.logger.log('🔧    GITHUB_OAUTH_ENABLED=true');
    this.logger.log('🔧    GITHUB_CLIENT_ID=your-client-id');
    this.logger.log('🔧    GITHUB_CLIENT_SECRET=your-secret');
    this.logger.log('🔧 ');
  }

  /**
   * Méthode publique pour obtenir le statut de la configuration
   */
  async getConfigurationStatus(): Promise<{
    providers: OAuthProviderCheck[];
    summary: {
      totalProviders: number;
      enabledProviders: number;
      configuredProviders: number;
      totalIssues: number;
    };
  }> {
    const providers = await this.performOAuthChecks();
    
    return {
      providers,
      summary: {
        totalProviders: providers.length,
        enabledProviders: providers.filter(p => p.enabled).length,
        configuredProviders: providers.filter(p => p.enabled && p.configured).length,
        totalIssues: providers.reduce((sum, p) => sum + p.issues.length, 0)
      }
    };
  }
}

