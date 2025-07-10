// mu-auth/src/authorization/authorization.controller.ts
import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthorizationService } from './authorization.service';
import { OPAInput } from 'smp-auth-ts';

/**
 * Contrôleur gRPC pour l'autorisation
 * Simplifié grâce à l'utilisation de smp-auth-ts
 */
@Controller()
export class AuthorizationController {
  private readonly logger = new Logger(AuthorizationController.name);

  constructor(private readonly authService: AuthorizationService) {}

  @GrpcMethod('AuthorizationService', 'CheckAccess')
  async checkAccess(request: any) {
    this.logger.debug(`gRPC CheckAccess request: ${JSON.stringify(request)}`);
    
    try {
      // Transformer la requête gRPC en entrée OPA compatible smp-auth-ts
      const opaInput: OPAInput = {
        user: {
          id: request.userId,
          roles: request.userRoles || [],
          organization_ids: request.organizationIds || [],
          state: request.userState || 'active',
          attributes: this.parseAttributes(request.userAttributes)
        },
        resource: {
          id: request.resourceId,
          type: request.resourceType,
          owner_id: request.resourceOwnerId,
          organization_id: request.resourceOrganizationId,
          attributes: this.parseAttributes(request.resourceAttributes)
        },
        action: request.action,
        context: this.parseAttributes(request.context)
      };
      
      const result = await this.authService.checkAccess(opaInput);
      
      return {
        allow: result.allow,
        reason: result.reason || ''
      };
    } catch (error) {
      this.logger.error(`Error in CheckAccess: ${error.message}`);
      return {
        allow: false,
        reason: 'Internal error during authorization check'
      };
    }
  }

  @GrpcMethod('AuthorizationService', 'ValidateToken')
  async validateToken(request: { token: string }) {
    try {
      // Cette méthode nécessiterait l'injection du service d'authentification
      // Pour l'instant, déléguer vers le service d'autorisation
      throw new Error('Token validation should be handled by AuthService');
    } catch (error) {
      this.logger.error(`Error in ValidateToken: ${error.message}`);
      throw error;
    }
  }

  @GrpcMethod('AuthorizationService', 'GetUserInfo')
  async getUserInfo(request: { userId: string }) {
    try {
      // Cette méthode devrait être déléguée au service d'authentification
      throw new Error('User info should be handled by AuthService');
    } catch (error) {
      this.logger.error(`Error in GetUserInfo: ${error.message}`);
      throw error;
    }
  }

  @GrpcMethod('AuthorizationService', 'GetUserRoles')
  async getUserRoles(request: { userId: string }) {
    try {
      // Cette méthode devrait être déléguée au service d'authentification
      throw new Error('User roles should be handled by AuthService');
    } catch (error) {
      this.logger.error(`Error in GetUserRoles: ${error.message}`);
      throw error;
    }
  }


  // === MÉTHODES UTILITAIRES ===

  private parseAttributes(attributes: Record<string, string> = {}): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      try {
        // Essayer de parser les valeurs JSON
        result[key] = JSON.parse(value);
      } catch {
        // Si ce n'est pas du JSON, utiliser la valeur telle quelle
        result[key] = value;
      }
    }
    
    return result;
  }
}