
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
  AuthenticationOptions,
  OPAInput
} from 'smp-auth-ts';

console.log('🚀 Starting Apollo Gateway with smp-auth-ts integration...');

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

const SUBGRAPH_CONFIG = {
  'mu-auth': {
    name: 'mu-auth',
    url: process.env.MU_AUTH_URL || 'http://localhost:3001/graphql'
  },
  // Ajouter d'autres subgraphs ici quand nécessaire
  // 'mu-organization': {
  //   name: 'mu-organization',
  //   url: process.env.MU_ORGANIZATION_URL || 'http://localhost:3002/graphql'
  // }
};

class FrontendSimulationAuthPlugin {
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
      userEmail: contextValue.userEmail,
      userName: contextValue.userName,
      userRoles: contextValue.userRoles || [],
      userOrganizations: contextValue.userOrganizations || [],
      userDepartment: contextValue.userDepartment,
      userClearanceLevel: contextValue.userClearanceLevel,
      token: contextValue.headers?.authorization?.replace('Bearer ', '')
    };
  }

  
  private isPublicOperation(operation: any, operationName?: string): boolean {
    const publicOperations = [
      'login', 'register', 'health', 'verifyInvitationToken',
      'resetPassword', 'confirmEmail', 'validateUsername',
      'validateEmail', 'generateUsernameSuggestions', 'getPasswordPolicy',
      'isRegistrationEnabled','registerUser', 'verifyEmail', 'resendVerificationEmail',
      'requestPasswordReset', 'validatePassword', 'validateUsername', 'validateEmail', 'generateUsernameSuggestions',
      'getRegistrationStatus', 'getPasswordPolicy','testRedisConnection', 'testKeycloakConnection', 'testOPAConnection',
      'getAuthenticationStats','validateToken'
    ];
    
    if (operationName && publicOperations.includes(operationName)) {
      console.log(`✅ Public operation detected by name: ${operationName}`);
      return true;
    }

    if (operation?.selectionSet?.selections?.length > 0) {
      const firstField = operation.selectionSet.selections[0]?.name?.value;
      if (firstField && publicOperations.includes(firstField)) {
        console.log(`✅ Public operation detected by field: ${firstField}`);
        return true;
      }
    }

    if (operation?.operation === 'mutation') {
      const mutationFields = operation.selectionSet?.selections?.map(
        (selection: any) => selection.name?.value
      ) || [];
      
      const hasPublicMutation = mutationFields.some((field: string) => 
        publicOperations.includes(field)
      );
      
      if (hasPublicMutation) {
        console.log(`✅ Public mutation detected: ${mutationFields.join(', ')}`);
        return true;
      }
    }

    console.log(`🔒 Private operation: ${operationName || 'unknown'}`);
    return false;
  }

  private extractResourceInfo(operation: any, operationName?: string) {
    try {
      if (!operation || !operation.selectionSet?.selections?.length) {
        return {
          resourceType: 'graphql_query',
          resourceId: operationName || 'unknown_operation',
          action: operation?.operation === 'mutation' ? 'write' : 'read'
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
        'registerUser': { type: 'auth', action: 'register' }, 
        'refreshToken': { type: 'auth', action: 'refresh' },
        'validateToken': {type: 'auth', action: 'validate'},
        'logout': { type: 'auth', action: 'logout' },
        'changePassword': { type: 'auth', action: 'change_password' },
        'verifyEmail': { type: 'auth', action: 'verify_email' }, 
        'resendVerificationEmail': { type: 'auth', action: 'resend_verification' }, 
        'requestPasswordReset': { type: 'auth', action: 'reset_password' }, 
        'resetPassword': { type: 'auth', action: 'reset_password' },
        'validateUsername': { type: 'validation', action: 'validate' }, 
        'validateEmail': { type: 'validation', action: 'validate' }, 
        'validatePassword': { type: 'validation', action: 'validate' }, 
        'generateUsernameSuggestions': { type: 'validation', action: 'suggest' }, 
        'getPasswordPolicy': { type: 'policy', action: 'read' }, 
        'getRegistrationStatus': { type: 'policy', action: 'read' }, 
        'isRegistrationEnabled': { type: 'policy', action: 'read' }, 
        'getUser': { type: 'user', action: 'read' },
        'getUserInfo': { type: 'user', action: 'read' },
        'updateUser': { type: 'user', action: 'update' },
        'deleteUser': { type: 'user', action: 'delete' },
        'listUsers': { type: 'user', action: 'list' },
        'getUserRoles': { type: 'user', action: 'read_roles' },
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
        'testRedisConnection': { type: 'system', action: 'test' },
        'testKeycloakConnection': { type: 'system', action: 'test' },
        'testOPAConnection': { type: 'system', action: 'test' },
        'getAuthenticationStats': { type: 'system', action: 'read' },
        'query': { type: 'data', action: 'read' },
        'mutation': { type: 'data', action: 'write' }
      };

      const mapping = resourceMapping[fieldName] || 
                     resourceMapping[operation.operation] || 
                     { type: 'unknown', action: 'unknown' };

      return {
        resourceType: mapping.type,
        resourceId: resourceId === 'unknown' ? fieldName : resourceId,
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
      requestSource: "apollo-gateway-frontend-sim",
      organizationId: resourceInfo.organizationId || contextValue.userOrganizations?.[0],
      userAgent: contextValue.userAgent,
      resourcePath: `${resourceInfo.resourceType}/${resourceInfo.resourceId}`,
      gatewaySource: contextValue.headers?.['x-gateway-source'] || 'unknown',
      frontendSimulation: true
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
            
            console.log(`🔍 Processing operation: ${operationName || 'unnamed'}`);
            console.log(`🔍 Operation type: ${operation?.operation}`);
            
            // Permettre les requêtes d'introspection sans autorisation
            if (self.isIntrospectionQuery(requestContext)) {
              console.log('✅ Introspection query - bypassing auth');
              return;
            }

            // Vérifier si c'est une opération publique
            if (self.isPublicOperation(operation, operationName)) {
              console.log(`✅ Public operation - bypassing auth: ${operationName}`);
              return;
            }

            const userContext = self.extractUserContext(contextValue);
            
            // Vérifier si l'utilisateur est authentifié pour les opérations privées
            if (!userContext.userId) {
              console.log(`❌ Authentication required for operation: ${operationName}`);
              throw new Error('Authentication required - Please sign in through /api/auth/sign-in');
            }

            const resourceInfo = self.extractResourceInfo(operation, operationName);
            const authContext = self.buildAuthorizationContext(contextValue, resourceInfo);

            try {
              console.log(`🔒 Checking authorization for user ${userContext.userId}:`, {
                operation: operationName,
                resourceType: resourceInfo.resourceType,
                resourceId: resourceInfo.resourceId,
                action: resourceInfo.action
              });

              const allowed = await self.authService.checkPermission(
                userContext.token,
                resourceInfo.resourceId,
                resourceInfo.resourceType,
                resourceInfo.action,
                authContext
              );

              if (!allowed) {
                console.warn(`❌ Access denied for user ${userContext.userId}:`, {
                  resourceType: resourceInfo.resourceType,
                  resourceId: resourceInfo.resourceId,
                  action: resourceInfo.action,
                  traceId: contextValue.traceId
                });
                
                throw new Error(`Access denied: Insufficient permissions for ${resourceInfo.action} on ${resourceInfo.resourceType}. Please contact your administrator if you believe this is an error.`);
              }

              console.log(`✅ Access granted for user ${userContext.userId}:`, {
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
                timestamp: new Date().toISOString(),
                authMethod: 'smp-auth-ts'
              };

            } catch (error) {
              console.error(`💥 Authorization check failed:`, error);
              
              if (error) {
                throw error; 
              }
              
              throw new Error(`Authorization check failed: ${error instanceof Error ? error.message : 'Unknown error'}. This might be a temporary issue, please try again.`);
            }
          }
        };
      }
    };
  }
}


async function startGateway() {
  try {
    console.log('🔧 Initializing smp-auth-ts service...');
    
    const authResult = await initializeAuthService(authConfig, {
      ...authOptions,
      validateConfig: true,
      testConnectivity: true
    });

    if (!authResult.status.ready) {
      console.warn('⚠️ Auth service started with issues:', authResult.errors);
      console.warn('🔄 Continuing with limited functionality...');
    } else {
      console.log('✅ Auth service initialized successfully');
    }

    const authService = authResult.service;

    // Configuration de la gateway Apollo
    const gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
          {
            name: 'mu-auth',
            url: SUBGRAPH_CONFIG['mu-auth'].url
          }
        
        ],
        introspectionHeaders: {
          'User-Agent': 'Apollo-Gateway-Frontend-Simulation',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Gateway-Source': 'apollo-federation'
        },
        pollIntervalInMs: 30000, 
      }),
      debug: process.env.NODE_ENV !== 'production',
    });

    const authPlugin = new FrontendSimulationAuthPlugin(authService);

    const server = new ApolloServer({
      gateway,
      introspection: true,
      csrfPrevention: false,
      plugins: [
        authPlugin.plugin(),
        // Plugin de logging pour le frontend simulation
        {
          async requestDidStart() {
            return {
              async didReceiveRequest(requestContext: any) {
                const { request } = requestContext;
                console.log(`📨 GraphQL Request received:`, {
                  operationName: request.operationName,
                  variables: request.variables,
                  timestamp: new Date().toISOString(),
                  source: 'frontend-simulation'
                });
              },
              async willSendResponse(requestContext: any) {
                const { response } = requestContext;
                if (response.body.kind === 'single' && response.body.singleResult.errors) {
                  console.log(`❌ GraphQL Response with errors:`, {
                    errors: response.body.singleResult.errors.map((err: any) => err.message),
                    timestamp: new Date().toISOString()
                  });
                } else {
                  console.log(`✅ GraphQL Response sent successfully`);
                }
              }
            };
          }
        }
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
          return rolesHeader.split(',').map(role => role.trim()).filter(Boolean);
        };

        const processUserOrganizations = (orgHeader: string | string[] | undefined): string[] => {
          if (!orgHeader) return [];
          if (Array.isArray(orgHeader)) {
            return orgHeader.flatMap(org => org.split(','));
          }
          return orgHeader.split(',').map(org => org.trim()).filter(Boolean);
        };
        
        return {
          traceId,
          requestId: req.headers['x-request-id'] || uuidv4(),
          correlationId: req.headers['x-correlation-id'] || uuidv4(),
          userId: req.headers['x-user-id'] as string,
          userEmail: req.headers['x-user-email'] as string,
          userName: req.headers['x-user-name'] as string,
          userRoles: processUserRoles(req.headers['x-user-roles'] as string | string[]),
          userOrganizations: processUserOrganizations(req.headers['x-user-organizations'] as string | string[]),
          userDepartment: req.headers['x-user-department'] as string,
          userClearanceLevel: req.headers['x-user-clearance-level'] ? 
            parseInt(req.headers['x-user-clearance-level'] as string) : undefined,
          tenantId: req.headers['x-tenant-id'] as string,
          clientIp: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          timestamp: Date.now(),
          headers: req.headers,
          frontendSimulation: {
            gatewaySource: req.headers['x-gateway-source'] || 'unknown',
            forwardedBy: req.headers['x-forwarded-by'] || 'unknown',
            originalRequest: true
          }
        };
      }
    }));

    // Health check 
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
        const metrics = authService.getMetrics();

        const healthResponse = {
          status: allHealthy ? 'OK' : 'DEGRADED',
          timestamp: new Date().toISOString(),
          service: 'apollo-gateway-frontend-simulation',
          traceId,
          auth: {
            keycloak: { 
              status: keycloak ? 'up' : 'down',
              details: keycloakTest.status === 'fulfilled' ? keycloakTest.value : undefined
            },
            redis: { 
              status: redis ? 'up' : 'down',
              details: redisTest.status === 'fulfilled' ? redisTest.value : undefined
            },
            opa: { 
              status: opa ? 'up' : 'down',
              details: opaTest.status === 'fulfilled' ? opaTest.value : undefined
            }
          },
          gateway: {
            subgraphs: Object.keys(SUBGRAPH_CONFIG),
            federationVersion: '2.0',
            introspectionEnabled: true
          },
          metrics: {
            totalRequests: metrics.totalRequests || 0,
            successfulLogins: metrics.successfulLogins || 0,
            authorizationChecks: metrics.authorizationChecks || 0,
            cacheHitRate: metrics.cacheHitRate || 0
          },
          simulation: {
            frontendMode: true,
            authenticationFlow: 'krakend -> mu-auth -> keycloak',
            authorizationFlow: 'apollo-gateway -> smp-auth-ts -> opa',
            supportedOperations: [
              'sign-up via /api/auth/sign-up',
              'sign-in via /api/auth/sign-in', 
              'graphql queries via /graphql'
            ]
          }
        };

        res.status(allHealthy ? 200 : 503).json(healthResponse);
      } catch (error) {
        res.status(500).json({
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          service: 'apollo-gateway-frontend-simulation',
          traceId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    app.get('/debug', async (req, res) => {
      const traceId = req.headers['x-trace-id'] || uuidv4();
      
      try {
        const metrics = authService.getMetrics();
        
        const debugInfo = {
          timestamp: new Date().toISOString(),
          traceId,
          service: 'apollo-gateway-frontend-simulation',
          configuration: {
            subgraphs: SUBGRAPH_CONFIG,
            authConfig: {
              keycloak: {
                url: authConfig.keycloak.url,
                realm: authConfig.keycloak.realm,
                clientId: authConfig.keycloak.clientId
              },
              opa: {
                url: authConfig.opa.url,
                policyPath: authConfig.opa.policyPath
              },
              redis: {
                host: authConfig.redis.host,
                port: authConfig.redis.port,
                db: authConfig.redis.db
              }
            }
          },
          metrics,
          environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: process.env.PORT || 4000,
            version: process.env.npm_package_version || 'unknown'
          },
          simulationGuide: {
            signUp: {
              url: 'POST /api/auth/sign-up',
              payload: {
                username: 'john_doe',
                email: 'john@example.com',
                password: 'SecurePass123!',
                firstName: 'John',
                lastName: 'Doe'
              }
            },
            signIn: {
              url: 'POST /api/auth/sign-in',
              payload: {
                username: 'john_doe',
                password: 'SecurePass123!'
              }
            },
            graphqlQuery: {
              url: 'POST /graphql',
              headers: {
                'Authorization': 'Bearer <token_from_sign_in>',
                'Content-Type': 'application/json'
              },
              payload: {
                query: `query GetUser($userId: ID!) {
                  getUser(userId: $userId) {
                    sub
                    email
                    given_name
                    family_name
                    roles
                  }
                }`,
                variables: { userId: "<user_id>" }
              }
            }
          }
        };

        res.json(debugInfo);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
          traceId
        });
      }
    });

    const PORT = parseInt(process.env.PORT || '4000');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🎉 Apollo Gateway Frontend Simulation ready!');
      console.log(`🌐 GraphQL Endpoint: http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`🐛 Debug Info: http://localhost:${PORT}/debug`);
      console.log('');
      console.log('🔄 Frontend Simulation Flow:');
      console.log('  1️⃣ Sign-up: KrakenD /api/auth/sign-up → mu-auth → Keycloak');
      console.log('  2️⃣ Sign-in: KrakenD /api/auth/sign-in → mu-auth → Keycloak');
      console.log('  3️⃣ GraphQL: KrakenD /graphql → Apollo Gateway → smp-auth-ts → OPA → Subgraphs');
      console.log('');
      console.log('🛡️ Authorization: smp-auth-ts integrated with OPA');
      console.log(`📈 Federation: ${Object.keys(SUBGRAPH_CONFIG).length} subgraph(s) configured`);
      console.log(`🏢 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n🚀 Ready to simulate frontend requests!');
    });

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


startGateway();