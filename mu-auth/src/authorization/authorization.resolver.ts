// mu-auth/src/authorization/authorization.resolver.ts
import { Resolver, Query, Args, Context } from '@nestjs/graphql';
import { AuthorizationService } from './authorization.service';
import { AuthorizationRequestInput } from './dto/authorization-request.input';
import { AuthorizationResponseDto } from './dto/authorization-response.dto';
import { AuthorizationLogDto } from './dto/authorization-log.dto';
import { OPAInput } from 'smp-auth-ts';

@Resolver()
export class AuthorizationResolver {
  constructor(private readonly authService: AuthorizationService) {}

  @Query(() => AuthorizationResponseDto)
  async checkAccess(
    @Args('input') input: AuthorizationRequestInput,
    @Context() context: any
  ): Promise<AuthorizationResponseDto> {
    // Mapper l'input GraphQL vers le format OPA de smp-auth-ts
    const opaInput: OPAInput = {
      user: {
        id: input.user.id,
        roles: input.user.roles || [],
        organization_ids: input.user.organization_ids,
        state: input.user.state,
        attributes: {
          department: input.user.attributes?.department,
          clearanceLevel: input.user.attributes?.clearanceLevel,
          contractExpiryDate: input.user.attributes?.contractExpiryDate,
          managerId: input.user.attributes?.managerId,
          ...input.user.attributes?.additionalAttributes
        }
      },
      resource: {
        id: input.resource.id,
        type: input.resource.type,
        owner_id: input.resource.owner_id,
        organization_id: input.resource.organization_id,
        attributes: {
          isOfficial: input.resource.attributes?.isOfficial,
          department: input.resource.attributes?.department,
          confidential: input.resource.attributes?.confidential,
          requiredClearance: input.resource.attributes?.requiredClearance,
          state: input.resource.attributes?.state,
          ...input.resource.attributes?.additionalAttributes
        }
      },
      action: input.action,
      context: {
        ip: input.context?.ip,
        businessHours: input.context?.businessHours,
        currentDate: input.context?.currentDate,
        riskScore: input.context?.riskScore,
        ...input.context?.additionalContext
      }
    };

    const authHeader = context.req?.headers?.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : undefined;
    
    let result;
    if (token) {
      result = await this.authService.checkAccessWithToken(token, opaInput);
    } else {
      result = await this.authService.checkAccess(opaInput);
    }
    
    return {
      allow: result.allow,
      reason: result.reason,
      timestamp: new Date().toISOString()
    };
  }

  @Query(() => [AuthorizationLogDto])
  async getAuthorizationHistory(
    @Args('userId', { nullable: true }) userId?: string,
    @Args('resourceId', { nullable: true }) resourceId?: string,
    @Args('limit', { nullable: true, defaultValue: 100 }) limit?: number,
    @Args('offset', { nullable: true, defaultValue: 0 }) offset?: number
  ): Promise<AuthorizationLogDto[]> {
    const logs = await this.authService.getAuthorizationHistory(
      userId,
      resourceId,
      limit,
      offset
    );
    
    return logs.map(log => ({
      id: log.id || `${log.userId}-${log.timestamp}`,
      userId: log.userId,
      resourceId: log.resourceId,
      resourceType: log.resourceType,
      action: log.action,
      allow: log.allow,
      reason: log.reason,
      context: log.context,
      timestamp: log.timestamp,
      evaluationTime: log.evaluationTime,
      correlationId: log.correlationId,
      sessionId: log.sessionId,
      ip: log.ip,
      userAgent: log.userAgent
    }));
  }
}