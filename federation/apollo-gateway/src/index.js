import { ApolloServer } from '@apollo/server';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import express from 'express';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import bodyParser from 'body-parser';
import { register, collectDefaultMetrics } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';

console.log('🚀 Démarrage d\'Apollo Gateway avec OPA Authorization...');

// Métriques Prometheus
collectDefaultMetrics({ prefix: 'apollo_gateway_' });

// Configuration des subgraphs
const SUBGRAPH_CONFIG = {
  'mu-auth': {
    name: 'mu-auth',
    url: 'http://localhost:3001/graphql',
    healthUrl: 'http://localhost:3001/auth/health'
  },
  'mu-organization': {
    name: 'mu-organization',
    url:'http://localhost:4004/graphql'
  }
};

// Configuration OPA
const OPA_CONFIG = {
  authServiceUrl: 'http://localhost:3001/graphql',
  timeout: 5000
};

/**
 * Client pour appeler le service d'autorisation OPA
 */
class OPAAuthorizationClient {
  constructor(config) {
    this.authServiceUrl = config.authServiceUrl;
    this.timeout = config.timeout || 5000;
  }

  /**
   * Appel vers le service mu-auth pour vérification OPA
   */
  async checkAccess(opaInput) {
    const mutation = `
      query CheckAccess($input: AuthorizationRequestInput!) {
        checkAccess(input: $input) {
          allow
          reason
        }
      }
    `;

    try {
      const response = await fetch(this.authServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: { input: opaInput }
        }),
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`OPA service responded with ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result.data.checkAccess;
    } catch (error) {
      console.error(' Erreur lors de l\'appel OPA:', error);
      // En cas d'erreur, dénier par défaut pour la sécurité
      return {
        allow: false,
        reason: `Authorization service error: ${error.message}`
      };
    }
  }

  /**
   * Extraction des informations de ressource et action depuis une requête GraphQL
   */
  extractResourceInfo(operationAST, operationName) {
    try {
      if (!operationAST || !operationAST.definitions) {
        return {
          resourceType: 'unknown',
          resourceId: 'unknown',
          action: 'unknown',
          organizationId: null
        };
      }

      const operation = operationAST.definitions[0];
      
      if (!operation.selectionSet || !operation.selectionSet.selections) {
        return {
          resourceType: 'unknown',
          resourceId: 'unknown',
          action: operation.operation || 'unknown',
          organizationId: null
        };
      }

      const firstSelection = operation.selectionSet.selections[0];
      const fieldName = firstSelection.name?.value || 'unknown';
      
      // Extraction des arguments pour récupérer les IDs de ressource
      let resourceId = 'unknown';
      let organizationId = null;
      let additionalContext = {};
      
      if (firstSelection.arguments) {
        // Recherche des différents types d'identifiants
        const idArg = firstSelection.arguments.find(arg => 
          ['id', 'userId', 'organizationId', 'organizationID', 'userOrganizationID'].includes(arg.name.value)
        );
        
        if (idArg && idArg.value) {
          resourceId = idArg.value.value || 'unknown';
        }

        // Extraction spécifique de l'organizationId
        const orgIdArg = firstSelection.arguments.find(arg => 
          ['organizationId', 'organizationID'].includes(arg.name.value)
        );
        
        if (orgIdArg && orgIdArg.value) {
          organizationId = orgIdArg.value.value;
        }

        // Extraction d'informations depuis l'input pour les mutations
        const inputArg = firstSelection.arguments.find(arg => arg.name.value === 'input');
        if (inputArg && inputArg.value && inputArg.value.fields) {
          inputArg.value.fields.forEach(field => {
            if (field.name.value === 'organizationID' || field.name.value === 'organizationId') {
              organizationId = field.value.value;
            }
            if (field.name.value === 'userID' || field.name.value === 'userId') {
              if (resourceId === 'unknown') resourceId = field.value.value;
            }
            if (field.name.value === 'email') {
              additionalContext.targetEmail = field.value.value;
            }
          });
        }
      }

      // Mapping des opérations GraphQL vers des types de ressources et actions
      const resourceMapping = {
        // Authentification
        'login': { type: 'auth', action: 'authenticate' },
        'register': { type: 'auth', action: 'register' },
        'refreshToken': { type: 'auth', action: 'refresh' },
        
        // Utilisateurs
        'getUser': { type: 'user', action: 'read' },
        'getUserProfile': { type: 'user', action: 'read' },
        'updateUser': { type: 'user', action: 'update' },
        'deleteUser': { type: 'user', action: 'delete' },
        'listUsers': { type: 'user', action: 'list' },
        'getUserOrganizations': { type: 'user', action: 'read' },
        
        // Organisations - Gestion générale
        'getOrganization': { type: 'organization', action: 'read' },
        'createOrganization': { type: 'organization', action: 'create' },
        'updateOrganization': { type: 'organization', action: 'update' },
        'deleteOrganization': { type: 'organization', action: 'delete' },
        'listOrganizations': { type: 'organization', action: 'list' },
        
        // Organisations - Gestion des membres
        'listOrganizationMembers': { type: 'organization', action: 'list' },
        'inviteUserToOrganization': { type: 'organization', action: 'invite' },
        'addUserToOrganization': { type: 'organization', action: 'add_member' },
        'removeUserFromOrganization': { type: 'organization', action: 'remove_member' },
        'updateUserRoleInOrganization': { type: 'organization', action: 'update_member' },
        'removeInvitation': { type: 'organization', action: 'manage_invitation' },
        'verifyInvitationToken': { type: 'organization', action: 'verify_invitation' },
        'isUserInOrganization': { type: 'organization', action: 'read' },
        
        // UserOrganization - Relations utilisateur-organisation
        'createUserOrganization': { type: 'user_organization', action: 'create' },
        'updateUserOrganization': { type: 'user_organization', action: 'update' },
        'deleteUserOrganization': { type: 'user_organization', action: 'delete' },
        'userOrganizations': { type: 'user_organization', action: 'list' },
        'userOrganization': { type: 'user_organization', action: 'read' },
        'userOrganizationsByIDs': { type: 'user_organization', action: 'read' },
        'userOrganizationsBySlugs': { type: 'user_organization', action: 'read' },
        'userOrganizationByUniqRef': { type: 'user_organization', action: 'read' },
        'userOrganizationByUniqRefs': { type: 'user_organization', action: 'read' },
        'userOrganizationBySlug': { type: 'user_organization', action: 'read' },
        
        // Par défaut
        'query': { type: 'data', action: 'read' },
        'mutation': { type: 'data', action: 'write' },
        'subscription': { type: 'data', action: 'subscribe' }
      };

      const mapping = resourceMapping[fieldName] || resourceMapping[operation.operation] || { type: 'unknown', action: 'unknown' };

      return {
        resourceType: mapping.type,
        resourceId: resourceId,
        action: mapping.action,
        organizationId: organizationId,
        additionalContext: additionalContext
      };
    } catch (error) {
      console.error('Erreur lors de l\'extraction des informations de ressource:', error);
      return {
        resourceType: 'unknown',
        resourceId: 'unknown',
        action: 'unknown',
        organizationId: null,
        additionalContext: {}
      };
    }
  }
}

// Initialisation du client OPA
const opaClient = new OPAAuthorizationClient(OPA_CONFIG);

/**
 * Plugin Apollo pour l'autorisation OPA
 */
const authorizationPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation(requestContext) {
        const { operation, operationName, contextValue } = requestContext;
        
        // Ignorer les requêtes introspection et health checks
        if (operationName === 'IntrospectionQuery' || 
            requestContext.request.query?.includes('__schema') ||
            requestContext.request.query?.includes('__type')) {
          return;
        }

        // Extraire les informations utilisateur du contexte (propagées par KrakenD)
        const userId = contextValue.userId;
        const userRoles = contextValue.userRoles || [];
        const tenantId = contextValue.tenantId;
        
        // Si pas d'utilisateur authentifié, dénier (sauf pour certaines opérations publiques)
        if (!userId) {
          // Autoriser certaines opérations publiques
          const publicOperations = ['login', 'register', 'health'];
          const { action } = opaClient.extractResourceInfo(operation, operationName);
          
          if (!publicOperations.includes(action)) {
            throw new Error('Authentication required');
          }
          return;
        }

        // Extraire les informations de ressource et action depuis la requête GraphQL
        const { resourceType, resourceId, action, organizationId, additionalContext } = opaClient.extractResourceInfo(operation, operationName);

        // Construire l'entrée OPA en respectant exactement les DTOs mu-auth
        const opaInput = {
          user: {
            id: userId,
            roles: userRoles || [],
            organization_ids: tenantId ? [tenantId] : [],
            state: "active", // État par défaut
            attributes: {
              ...(contextValue.userDepartment && { department: contextValue.userDepartment }),
              ...(contextValue.userClearanceLevel && { clearanceLevel: parseInt(contextValue.userClearanceLevel) }),
              // Autres attributs utilisateur supportés
              additionalAttributes: {
                email: contextValue.userEmail,
                username: contextValue.username,
                name: contextValue.userName
              }
            }
          },
          resource: {
            id: resourceId,
            type: resourceType,
            ...(organizationId && { organization_id: organizationId }),
            ...(tenantId && !organizationId && { organization_id: tenantId }),
            attributes: {
              ...(resourceType === 'user_organization' && { userID: resourceId }),
              additionalAttributes: {
                requestedBy: userId,
                resourcePath: `${resourceType}/${resourceId}`
              }
            }
          },
          action: action,
          context: {
            ip: contextValue.clientIp || "127.0.0.1",
            businessHours: isBusinessHours(),
            currentDate: new Date().toISOString(),
            riskScore: 10, // Score de risque par défaut bas
            managementHierarchy: {},
            additionalContext: {
              traceId: contextValue.traceId,
              requestSource: "apollo-gateway",
              ...additionalContext
            }
          }
        };

        // Nettoyer les valeurs undefined pour éviter les erreurs GraphQL
        const cleanOpaInput = JSON.parse(JSON.stringify(opaInput, (key, value) => {
          return value === undefined ? null : value;
        }));

        console.log(`Vérification OPA pour ${userId}:`, {
          traceId: contextValue.traceId,
          resourceType,
          resourceId,
          action,
          userRoles,
          organizationId: organizationId || tenantId
        });

        // Appeler OPA pour vérification
        const authResult = await opaClient.checkAccess(cleanOpaInput);
        
        if (!authResult.allow) {
          console.warn(`Accès refusé par OPA:`, {
            traceId: contextValue.traceId,
            userId,
            resourceType,
            resourceId,
            action,
            reason: authResult.reason
          });
          
          throw new Error(`Access denied: ${authResult.reason || 'Insufficient permissions'}`);
        }

        console.log(`Accès autorisé par OPA:`, {
          traceId: contextValue.traceId,
          userId,
          resourceType,
          resourceId,
          action
        });

        // Enrichir le contexte avec les informations d'autorisation
        contextValue.authorization = {
          granted: true,
          reason: authResult.reason,
          resourceType,
          resourceId,
          action
        };
      }
    };
  }
};

/**
 * Fonction utilitaire pour vérifier les heures ouvrables
 */
function isBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Dimanche, 6 = Samedi
  
  // Lundi à Vendredi, 8h à 18h
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

// Configuration du Gateway avec authorization
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      {
        name: 'mu-auth',
        url: 'http://localhost:3001/graphql'
      },
      {
        name: 'mu-organization',
        url: 'http://localhost:4004/graphql'
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

async function startServer() {
  try {
    console.log('   Configuration du Gateway Apollo avec OPA:');
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   OPA Service: ${OPA_CONFIG.authServiceUrl}`);
    console.log('   Subgraphs fédérés:');
    Object.values(SUBGRAPH_CONFIG).forEach(config => {
      console.log(`     ${config.name}: ${config.url}`);
    });

    const server = new ApolloServer({
      gateway,
      introspection: true,
      csrfPrevention: false,
      plugins: [
        authorizationPlugin, // Plugin d'autorisation OPA
        {
          async serverWillStart() {
            console.log('Apollo Gateway avec OPA Authorization initialisé');
            console.log(`Subgraphs fédérés: ${Object.keys(SUBGRAPH_CONFIG).length}`);
            console.log('Authorization OPA: ACTIVÉE');
          },
          async requestDidStart() {
            return {
              async didResolveOperation(requestContext) {
                const { operationName, request } = requestContext;
                const { traceId, correlationId, userId, authorization } = requestContext.contextValue;
                
                console.log(`Opération autorisée: ${operationName || 'Anonymous'}`, {
                  traceId,
                  correlationId,
                  userId: userId || 'anonymous',
                  authorized: authorization?.granted || false,
                  resourceType: authorization?.resourceType,
                  action: authorization?.action,
                  timestamp: new Date().toISOString()
                });
              },
              async didEncounterErrors(requestContext) {
                const { errors, contextValue } = requestContext;
                console.error(`Erreurs GraphQL:`, {
                  traceId: contextValue.traceId,
                  errors: errors.map(err => ({
                    message: err.message,
                    path: err.path,
                    extensions: err.extensions
                  }))
                });
              },
              async willSendResponse(requestContext) {
                const { response, contextValue } = requestContext;
                const responseTime = Date.now() - contextValue.timestamp;
                
                // Headers de réponse enrichis
                response.http.headers.set('x-trace-id', contextValue.traceId);
                response.http.headers.set('x-correlation-id', contextValue.correlationId);
                response.http.headers.set('x-response-time', `${responseTime}ms`);
                response.http.headers.set('x-authorization-service', 'opa');
                response.http.headers.set('x-gateway-version', '2.1.0');

                console.log(` Réponse envoyée:`, {
                  traceId: contextValue.traceId,
                  responseTime: `${responseTime}ms`,
                  authorized: contextValue.authorization?.granted || false,
                  hasErrors: response.body.kind === 'complete' && response.body.singleResult.errors?.length > 0,
                  timestamp: new Date().toISOString()
                });
              }
            };
          }
        }
      ],
    });

    await server.start();
    console.log('Gateway Apollo avec OPA Authorization démarré');

    const app = express();

    app.use(cors({
      origin: true,
      credentials: true,
      exposedHeaders: [
        'x-trace-id', 
        'x-correlation-id', 
        'x-response-time', 
        'x-authorization-service',
        'x-gateway-version'
      ]
    }));
    app.use(bodyParser.json({ limit: '10mb' }));

    // Middleware de logging
    app.use((req, res, next) => {
      const traceId = req.headers['x-trace-id'] || uuidv4();
      const timestamp = Date.now();
      
      console.log(`📥 Requête entrante:`, {
        method: req.method,
        path: req.path,
        traceId,
        userId: req.headers['x-user-id'] || 'anonymous',
        userRoles: req.headers['x-user-roles'],
        timestamp: new Date().toISOString()
      });

      req.startTime = timestamp;
      req.traceId = traceId;
      next();
    });

    // Endpoint GraphQL avec contexte enrichi et authorization
    app.use('/graphql', expressMiddleware(server, {
      context: async ({ req }) => {
        const requestId = req.headers['x-request-id'] || uuidv4();
        const traceId = req.traceId || req.headers['x-trace-id'] || uuidv4();
        const correlationId = req.headers['x-correlation-id'] || uuidv4();
        
        // Contexte enrichi avec informations d'authentification (de KrakenD)
        const enrichedContext = {
          // IDs de traçabilité
          requestId,
          traceId,
          correlationId,
          
          // Informations utilisateur (propagées par KrakenD après auth Keycloak)
          userId: req.headers['x-user-id'],
          userEmail: req.headers['x-user-email'],
          userName: req.headers['x-user-name'],
          username: req.headers['x-username'],
          userRoles: req.headers['x-user-roles']?.split(',') || [],
          tenantId: req.headers['x-tenant-id'],
          
          // Attributs utilisateur supplémentaires (si propagés)
          userDepartment: req.headers['x-user-department'],
          userClearanceLevel: req.headers['x-user-clearance-level'],
          
          // Informations techniques
          clientIp: req.ip || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          gatewaySource: req.headers['x-gateway-source'],
          forwardedBy: req.headers['x-forwarded-by'],
          
          // Timestamps
          timestamp: req.startTime || Date.now(),
          requestStartTime: new Date().toISOString(),
          
          // Headers complets
          headers: req.headers,
          
          // Métadonnées
          federation: {
            enabled: true,
            gateway: 'apollo-federation',
            authorization: 'opa',
            subgraphs: Object.keys(SUBGRAPH_CONFIG)
          }
        };

        // Log du contexte (sans headers sensibles)
        console.log(`🔧 Contexte avec Authorization:`, {
          traceId: enrichedContext.traceId,
          userId: enrichedContext.userId || 'anonymous',
          userRoles: enrichedContext.userRoles,
          tenantId: enrichedContext.tenantId,
          authorizationEnabled: true
        });

        return enrichedContext;
      }
    }));

    // Health check
    app.get('/health', async (req, res) => {
      const startTime = Date.now();
      const traceId = req.traceId || uuidv4();
      
      // Test de connectivité OPA
      let opaStatus = 'disconnected';
      try {
        const testInput = {
          user: { id: 'health-check', roles: ['system'] },
          resource: { id: 'health', type: 'system' },
          action: 'read',
          context: {}
        };
        await opaClient.checkAccess(testInput);
        opaStatus = 'connected';
      } catch (error) {
        console.warn('⚠️ OPA health check failed:', error.message);
      }

      const totalResponseTime = Date.now() - startTime;

      const healthResponse = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'apollo-gateway-federation-opa',
        version: '2.1.0',
        traceId,
        responseTime: `${totalResponseTime}ms`,
        authorization: {
          enabled: true,
          service: 'opa',
          status: opaStatus,
          endpoint: OPA_CONFIG.authServiceUrl
        },
        federation: {
          enabled: true,
          subgraph_count: Object.keys(SUBGRAPH_CONFIG).length
        }
      };

      res.json(healthResponse);
    });

    // Métriques Prometheus
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        console.error('❌ Erreur métriques:', error);
        res.status(500).end('Erreur métriques');
      }
    });

    const PORT = process.env.PORT || 4000;

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🎉 Apollo Gateway avec OPA Authorization démarré !');
      console.log('═══════════════════════════════════════════════════════════');
     
    });

  } catch (error) {
    console.error('Erreur lors de l\'initialisation du Gateway:', error);
    process.exit(1);
  }
}

// Gestion des erreurs
process.on('unhandledRejection', (err) => {
  console.error('Erreur de fédération GraphQL:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Erreur  du Gateway:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('Signal SIGTERM reçu...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Signal SIGINT reçu...');
  process.exit(0);
});

startServer();