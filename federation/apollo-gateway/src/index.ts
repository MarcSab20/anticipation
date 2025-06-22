import { ApolloServer } from '@apollo/server';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import express from 'express';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import bodyParser from 'body-parser';
import { register, collectDefaultMetrics } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';
import { 
  createAuthService, 
  initializeAuthService,
  loadConfigFromObject,
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

// Métriques Prometheus
collectDefaultMetrics({ prefix: 'apollo_gateway_' });

// Configuration des subgraphs
const SUBGRAPH_CONFIG = {
  'mu-auth': {
    name: 'mu-auth',
    url: process.env.MU_AUTH_URL || 'http://localhost:3001/graphql'
  },
  'mu-organization': {
    name: 'mu-organization', 
    url: process.env.MU_ORGANIZATION_URL || 'http://localhost:4004/graphql'
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
    // Définir les opérations publiques
    const publicOperations = [
      'login', 'register', 'health', 'verifyInvitationToken',
      'resetPassword', 'confirmEmail'
    ];
    
    if (operationName && publicOperations.includes(operationName)) {
      return true;
    }

    // Vérifier le premier champ de la sélection
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
      
      // Extraction des arguments pour récupérer les IDs
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

        // Extraction depuis input pour les mutations
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

      // Mapping des opérations GraphQL vers types de ressources et actions
      const resourceMapping: Record<string, { type: string; action: string }> = {
        // Authentification
        'login': { type: 'auth', action: 'authenticate' },
        'register': { type: 'auth', action: 'register' },
        'refreshToken': { type: 'auth', action: 'refresh' },
        
        // Utilisateurs
        'getUser': { type: 'user', action: 'read' },
        'updateUser': { type: 'user', action: 'update' },
        'deleteUser': { type: 'user', action: 'delete' },
        'listUsers': { type: 'user', action: 'list' },
        
        // Organisations
        'getOrganization': { type: 'organization', action: 'read' },
        'createOrganization': { type: 'organization', action: 'create' },
        'updateOrganization': { type: 'organization', action: 'update' },
        'deleteOrganization': { type: 'organization', action: 'delete' },
        'listOrganizations': { type: 'organization', action: 'list' },
        'inviteUserToOrganization': { type: 'organization', action: 'invite' },
        'addUserToOrganization': { type: 'organization', action: 'add_member' },
        'removeUserFromOrganization': { type: 'organization', action: 'remove_member' },
        
        // UserOrganization
        'createUserOrganization': { type: 'user_organization', action: 'create' },
        'updateUserOrganization': { type: 'user_organization', action: 'update' },
        'deleteUserOrganization': { type: 'user_organization', action: 'delete' },
        'userOrganizations': { type: 'user_organization', action: 'list' },
        'userOrganization': { type: 'user_organization', action: 'read' },
        
        // Par défaut
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
    const day = now.getDay(); // 0 = Dimanche, 6 = Samedi
    
    // Lundi à Vendredi, 8h à 18h
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
  }

  plugin() {
    // Capturer le contexte de la classe
    const self = this;
    
    return {
      async requestDidStart() {
        return {
          async didResolveOperation(requestContext: any) {
            const { operation, operationName, contextValue } = requestContext;
            
            // Ignorer les requêtes introspection et health checks
            if (self.isIntrospectionQuery(requestContext)) {
              return;
            }

            // Extraire les informations utilisateur du contexte
            const userContext = self.extractUserContext(contextValue);
            
            // Si pas d'utilisateur authentifié, vérifier si l'opération est publique
            if (!userContext.userId) {
              if (!self.isPublicOperation(operation, operationName)) {
                throw new Error('Authentication required');
              }
              return;
            }

            // Extraire les informations de ressource et action
            const resourceInfo = self.extractResourceInfo(operation, operationName);
            
            // Construire le contexte d'autorisation
            const authContext = self.buildAuthorizationContext(contextValue, resourceInfo);

            try {
              // Vérification d'autorisation via smp-auth-ts
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

              // Enrichir le contexte avec les informations d'autorisation
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
    
    // Initialiser le service d'authentification avec validation
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

    // Configuration du Gateway avec autorisation smp-auth-ts
    const gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
          {
            name: 'mu-auth',
            url: SUBGRAPH_CONFIG['mu-auth'].url
          },
          {
            name: 'mu-organization', 
            url: SUBGRAPH_CONFIG['mu-organization'].url
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

    // Créer le plugin d'autorisation
    const authPlugin = new AuthorizationPlugin(authService);

    const server = new ApolloServer({
      gateway,
      introspection: true,
      csrfPrevention: false,
      plugins: [
        authPlugin.plugin(),
        {
          async serverWillStart() {
            console.log('✅ Apollo Gateway with smp-auth-ts started');
            console.log(`📊 Subgraphs: ${Object.keys(SUBGRAPH_CONFIG).length}`);
            console.log('🛡️ Authorization: ENABLED via smp-auth-ts');
          },
          async requestDidStart() {
            return {
              async didResolveOperation(requestContext: any) {
                const { operationName, contextValue } = requestContext;
                console.log(`🔍 Operation: ${operationName || 'Anonymous'}`, {
                  traceId: contextValue.traceId,
                  userId: contextValue.userId || 'anonymous',
                  authorized: contextValue.authorization?.granted || false
                });
              },
              async didEncounterErrors(requestContext: any) {
                const { errors, contextValue } = requestContext;
                console.error(`❌ GraphQL Errors:`, {
                  traceId: contextValue.traceId,
                  errors: errors.map((err: any) => ({
                    message: err.message,
                    path: err.path
                  }))
                });
              },
              async willSendResponse(requestContext: any) {
                const { response, contextValue } = requestContext;
                const responseTime = Date.now() - contextValue.timestamp;
                
                // Headers de réponse enrichis
                response.http.headers.set('x-trace-id', contextValue.traceId);
                response.http.headers.set('x-response-time', `${responseTime}ms`);
                response.http.headers.set('x-auth-service', 'smp-auth-ts');
                response.http.headers.set('x-gateway-version', '2.0.0');
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
      credentials: true,
      exposedHeaders: ['x-trace-id', 'x-response-time', 'x-auth-service']
    }));
    app.use(bodyParser.json({ limit: '10mb' }));

    // Middleware de contexte enrichi
    app.use('/graphql', expressMiddleware(server, {
      context: async ({ req }) => {
        const traceId = req.headers['x-trace-id'] || uuidv4();
        
        // Fonction utilitaire pour traiter les headers de rôles
        const processUserRoles = (rolesHeader: string | string[] | undefined): string[] => {
          if (!rolesHeader) return [];
          if (Array.isArray(rolesHeader)) {
            return rolesHeader.flatMap(role => role.split(','));
          }
          return rolesHeader.split(',');
        };
        
        return {
          // IDs de traçabilité
          traceId,
          requestId: req.headers['x-request-id'] || uuidv4(),
          correlationId: req.headers['x-correlation-id'] || uuidv4(),
          
          // Informations utilisateur (de KrakenD)
          userId: req.headers['x-user-id'] as string,
          userEmail: req.headers['x-user-email'] as string,
          userName: req.headers['x-user-name'] as string,
          userRoles: processUserRoles(req.headers['x-user-roles'] as string | string[]),
          tenantId: req.headers['x-tenant-id'] as string,
          
          // Informations techniques
          clientIp: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          
          // Timestamp
          timestamp: Date.now(),
          
          // Headers complets pour autorisation
          headers: req.headers,
          
          // Métadonnées
          federation: {
            enabled: true,
            gateway: 'apollo-federation',
            authService: 'smp-auth-ts',
            version: '2.0.0'
          }
        };
      }
    }));

    // Health check avec status des services
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
          uptime: process.uptime(),
          service: 'apollo-gateway-smp-auth',
          version: '2.0.0',
          traceId,
          auth: {
            service: 'smp-auth-ts',
            keycloak: { status: keycloak ? 'up' : 'down' },
            redis: { status: redis ? 'up' : 'down' },
            opa: { status: opa ? 'up' : 'down' }
          },
          federation: {
            enabled: true,
            subgraphs: Object.keys(SUBGRAPH_CONFIG)
          },
          metrics: {
            totalRequests: metrics.totalRequests,
            cacheHitRate: metrics.cacheHitRate,
            authorizationChecks: metrics.authorizationChecks
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

    // Métriques Prometheus
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        console.error('❌ Metrics error:', error);
        res.status(500).end('Metrics error');
      }
    });

    // Debug endpoint pour configuration
    app.get('/debug/config', (req, res) => {
      res.json({
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
            prefix: authConfig.redis.prefix
          }
        },
        environment: process.env.NODE_ENV || 'development'
      });
    });

    const PORT = parseInt(process.env.PORT || '4000');

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🎉 Apollo Gateway with smp-auth-ts ready!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`🌐 GraphQL Endpoint: http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
      console.log(`🔧 Debug Config: http://localhost:${PORT}/debug/config`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🛡️ Authorization: smp-auth-ts integrated');
      console.log(`📈 Federation: ${Object.keys(SUBGRAPH_CONFIG).length} subgraphs`);
      console.log(`🏢 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('═══════════════════════════════════════════════════════════\n');
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

// Gestion globale des erreurs
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

startServer();