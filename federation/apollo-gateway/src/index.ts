import { ApolloServer } from '@apollo/server';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import express from 'express';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import { 
  initializeAuthService,
  IAuthenticationService,
  AuthConfig,
  AuthenticationOptions 
} from 'smp-auth-ts';

console.log('🚀 Starting Apollo Gateway with smp-auth-ts integration...');

// Configuration unifiée via smp-auth-ts
const authConfig: AuthConfig = {
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'mu-realm',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mu-client',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
    timeout: parseInt(process.env.KEYCLOAK_TIMEOUT || '10000'),
    enableCache: true,
    cacheExpiry: 3600
  },
  opa: {
    url: process.env.OPA_URL || 'http://localhost:8181',
    policyPath: process.env.OPA_POLICY_PATH || '/v1/data/authz/decision',
    timeout: parseInt(process.env.OPA_TIMEOUT || '5000')
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    prefix: process.env.REDIS_PREFIX || 'apollo:auth:'
  }
};

const authOptions: AuthenticationOptions = {
  enableCache: true,
  cacheExpiry: 3600,
  enableLogging: true,
  enableSessionTracking: true,
  development: {
    enableDebugLogging: process.env.NODE_ENV === 'development',
    mockMode: false
  }
};

// Configuration des subgraphs
const SUBGRAPH_CONFIG = {
  'mu-auth': {
    name: 'mu-auth',
    url: process.env.MU_AUTH_URL || 'http://localhost:3001/graphql'
  }
};

/**
 * Plugin d'autorisation avancé utilisant smp-auth-ts
 */
class AuthorizationPlugin {
  private authService: IAuthenticationService;

  constructor(authService: IAuthenticationService) {
    this.authService = authService;
  }

  private isIntrospectionQuery(requestContext: any): boolean {
    const { operationName, request } = requestContext;
    return operationName === 'IntrospectionQuery' || 
           request.query?.includes('__schema') ||
           request.query?.includes('__type');
  }

  private extractUserContext(contextValue: any) {
    return {
      userId: contextValue.userId,
      userRoles: contextValue.userRoles || [],
      tenantId: contextValue.tenantId,
      userEmail: contextValue.userEmail,
      token: contextValue.headers?.authorization?.replace('Bearer ', '')
    };
  }

  private isPublicOperation(operation: any, operationName?: string): boolean {
    const publicOperations = [
      'login', 'register', 'health', 'verifyInvitationToken',
      'resetPassword', 'confirmEmail'
    ];
    
    if (operationName && publicOperations.includes(operationName)) {
      return true;
    }

    if (operation?.selectionSet?.selections?.length > 0) {
      const firstField = operation.selectionSet.selections[0]?.name?.value;
      return publicOperations.includes(firstField);
    }

    return false;
  }

  private extractResourceInfo(operation: any, operationName?: string) {
    try {
      if (!operation || !operation.selectionSet?.selections?.length) {
        return {
          resourceType: 'unknown',
          resourceId: 'unknown', 
          action: 'unknown'
        };
      }

      const firstSelection = operation.selectionSet.selections[0];
      const fieldName = firstSelection.name?.value || 'unknown';
      
      let resourceId = 'unknown';
      let organizationId = null;
      
      if (firstSelection.arguments) {
        const idArg = firstSelection.arguments.find((arg: any) => 
          ['id', 'userId', 'organizationId', 'userOrganizationID'].includes(arg.name.value)
        );
        
        if (idArg?.value?.value) {
          resourceId = idArg.value.value;
        }

        const orgIdArg = firstSelection.arguments.find((arg: any) => 
          ['organizationId', 'organizationID'].includes(arg.name.value)
        );
        
        if (orgIdArg?.value?.value) {
          organizationId = orgIdArg.value.value;
        }

        const inputArg = firstSelection.arguments.find((arg: any) => arg.name.value === 'input');
        if (inputArg?.value?.fields) {
          inputArg.value.fields.forEach((field: any) => {
            if (['organizationID', 'organizationId'].includes(field.name.value)) {
              organizationId = field.value.value;
            }
            if (['userID', 'userId'].includes(field.name.value) && resourceId === 'unknown') {
              resourceId = field.value.value;
            }
          });
        }
      }

      const resourceMapping: Record<string, { type: string; action: string }> = {
        'login': { type: 'auth', action: 'authenticate' },
        'register': { type: 'auth', action: 'register' },
        'refreshToken': { type: 'auth', action: 'refresh' },
        'getUser': { type: 'user', action: 'read' },
        'updateUser': { type: 'user', action: 'update' },
        'deleteUser': { type: 'user', action: 'delete' },
        'listUsers': { type: 'user', action: 'list' },
        'getOrganization': { type: 'organization', action: 'read' },
        'createOrganization': { type: 'organization', action: 'create' },
        'updateOrganization': { type: 'organization', action: 'update' },
        'deleteOrganization': { type: 'organization', action: 'delete' },
        'listOrganizations': { type: 'organization', action: 'list' },
        'inviteUserToOrganization': { type: 'organization', action: 'invite' },
        'addUserToOrganization': { type: 'organization', action: 'add_member' },
        'removeUserFromOrganization': { type: 'organization', action: 'remove_member' },
        'createUserOrganization': { type: 'user_organization', action: 'create' },
        'updateUserOrganization': { type: 'user_organization', action: 'update' },
        'deleteUserOrganization': { type: 'user_organization', action: 'delete' },
        'userOrganizations': { type: 'user_organization', action: 'list' },
        'userOrganization': { type: 'user_organization', action: 'read' },
        'query': { type: 'data', action: 'read' },
        'mutation': { type: 'data', action: 'write' }
      };

      const mapping = resourceMapping[fieldName] || 
                     resourceMapping[operation.operation] || 
                     { type: 'unknown', action: 'unknown' };

      return {
        resourceType: mapping.type,
        resourceId: resourceId,
        action: mapping.action,
        organizationId: organizationId
      };

    } catch (error) {
      console.error('Error extracting resource info:', error);
      return {
        resourceType: 'unknown',
        resourceId: 'unknown',
        action: 'unknown'
      };
    }
  }

  private buildAuthorizationContext(contextValue: any, resourceInfo: any) {
    return {
      ip: contextValue.clientIp || "127.0.0.1",
      businessHours: this.isBusinessHours(),
      currentDate: new Date().toISOString(),
      riskScore: 10,
      traceId: contextValue.traceId,
      requestSource: "apollo-gateway",
      organizationId: resourceInfo.organizationId || contextValue.tenantId,
      userAgent: contextValue.userAgent,
      resourcePath: `${resourceInfo.resourceType}/${resourceInfo.resourceId}`
    };
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
  }

  plugin() {
    const self = this;
    
    return {
      async requestDidStart() {
        return {
          async didResolveOperation(requestContext: any) {
            const { operation, operationName, contextValue } = requestContext;
            
            if (self.isIntrospectionQuery(requestContext)) {
              return;
            }

            const userContext = self.extractUserContext(contextValue);
            
            if (!userContext.userId) {
              if (!self.isPublicOperation(operation, operationName)) {
                throw new Error('Authentication required');
              }
              return;
            }

            const resourceInfo = self.extractResourceInfo(operation, operationName);
            const authContext = self.buildAuthorizationContext(contextValue, resourceInfo);

            try {
              const allowed = await self.authService.checkPermission(
                userContext.token,
                resourceInfo.resourceId,
                resourceInfo.resourceType,
                resourceInfo.action,
                authContext
              );

              if (!allowed) {
                console.warn(`Access denied for user ${userContext.userId}:`, {
                  resourceType: resourceInfo.resourceType,
                  resourceId: resourceInfo.resourceId,
                  action: resourceInfo.action,
                  traceId: contextValue.traceId
                });
                
                throw new Error(`Access denied: Insufficient permissions for ${resourceInfo.action} on ${resourceInfo.resourceType}`);
              }

              console.log(`Access granted for user ${userContext.userId}:`, {
                resourceType: resourceInfo.resourceType,
                resourceId: resourceInfo.resourceId,
                action: resourceInfo.action,
                traceId: contextValue.traceId
              });

              contextValue.authorization = {
                granted: true,
                resourceType: resourceInfo.resourceType,
                resourceId: resourceInfo.resourceId,
                action: resourceInfo.action,
                timestamp: new Date().toISOString()
              };

            } catch (error) {
              console.error(`Authorization check failed:`, error);
              throw new Error(`Access denied: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        };
      }
    };
  }
}

async function startServer() {
  try {
    console.log('🔧 Initializing smp-auth-ts service...');
    
    const authResult = await initializeAuthService(authConfig, {
      ...authOptions,
      validateConfig: true,
      testConnectivity: true
    });

    if (!authResult.status.ready) {
      console.warn('⚠️ Auth service started with issues:', authResult.errors);
    } else {
      console.log('✅ Auth service initialized successfully');
    }

    const authService = authResult.service;

    const gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
          {
            name: 'mu-auth',
            url: SUBGRAPH_CONFIG['mu-auth'].url
          }
        ],
        introspectionHeaders: {
          'User-Agent': 'Apollo-Gateway-Federation-v2',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        pollIntervalInMs: 10000,
      }),
      debug: process.env.NODE_ENV !== 'production',
    });

    const authPlugin = new AuthorizationPlugin(authService);

    const server = new ApolloServer({
      gateway,
      introspection: true,
      csrfPrevention: false,
      plugins: [
        authPlugin.plugin()
      ],
    });

    await server.start();

    const app = express();

    app.use(cors({
      origin: true,
      credentials: true
    }));
    app.use(bodyParser.json({ limit: '10mb' }));

    app.use('/graphql', expressMiddleware(server, {
      context: async ({ req }) => {
        const traceId = req.headers['x-trace-id'] || uuidv4();
        
        const processUserRoles = (rolesHeader: string | string[] | undefined): string[] => {
          if (!rolesHeader) return [];
          if (Array.isArray(rolesHeader)) {
            return rolesHeader.flatMap(role => role.split(','));
          }
          return rolesHeader.split(',');
        };
        
        return {
          traceId,
          requestId: req.headers['x-request-id'] || uuidv4(),
          correlationId: req.headers['x-correlation-id'] || uuidv4(),
          userId: req.headers['x-user-id'] as string,
          userEmail: req.headers['x-user-email'] as string,
          userName: req.headers['x-user-name'] as string,
          userRoles: processUserRoles(req.headers['x-user-roles'] as string | string[]),
          tenantId: req.headers['x-tenant-id'] as string,
          clientIp: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: Date.now(),
          headers: req.headers
        };
      }
    }));

    // Health check simplifié
    app.get('/health', async (req, res) => {
      const traceId = req.headers['x-trace-id'] || uuidv4();
      
      try {
        const [keycloakTest, redisTest, opaTest] = await Promise.allSettled([
          authService.testKeycloakConnection(),
          authService.testRedisConnection(),
          authService.testOPAConnection()
        ]);

        const keycloak = keycloakTest.status === 'fulfilled' && keycloakTest.value.connected;
        const redis = redisTest.status === 'fulfilled' && redisTest.value.connected;
        const opa = opaTest.status === 'fulfilled' && opaTest.value.connected;
        
        const allHealthy = keycloak && redis && opa;

        const healthResponse = {
          status: allHealthy ? 'OK' : 'DEGRADED',
          timestamp: new Date().toISOString(),
          service: 'apollo-gateway-smp-auth',
          traceId,
          auth: {
            keycloak: { status: keycloak ? 'up' : 'down' },
            redis: { status: redis ? 'up' : 'down' },
            opa: { status: opa ? 'up' : 'down' }
          }
        };

        res.status(allHealthy ? 200 : 503).json(healthResponse);
      } catch (error) {
        res.status(500).json({
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          traceId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    const PORT = parseInt(process.env.PORT || '4000');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🎉 Apollo Gateway with smp-auth-ts ready!');
      console.log(`🌐 GraphQL Endpoint: http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log('🛡️ Authorization: smp-auth-ts integrated');
      console.log(`📈 Federation: ${Object.keys(SUBGRAPH_CONFIG).length} subgraphs`);
      console.log(`🏢 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // Graceful shutdown
    const cleanup = async () => {
      console.log('\n🔄 Shutting down Apollo Gateway...');
      try {
        await authService.close();
        console.log('✅ Auth service closed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

  } catch (error) {
    console.error('❌ Failed to start Apollo Gateway:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

startServer();