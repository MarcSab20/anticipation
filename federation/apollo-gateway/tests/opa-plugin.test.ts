import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { EnhancedOPAAuthPlugin, createOPAAuthPlugin } from '../src/index';
import { IAuthenticationService } from 'smp-auth-ts';

// =============================================================================
// MOCKS ET SETUP
// =============================================================================

const mockAuthService: jest.Mocked<IAuthenticationService> = {
  login: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  validateToken: jest.fn(),
  getClientCredentialsToken: jest.fn(),
  getUserInfo: jest.fn(),
  getUserRoles: jest.fn(),
  registerUser: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  resetPassword: jest.fn(),
  changePassword: jest.fn(),
  checkPermission: jest.fn(),
  checkPermissionDetailed: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn()
};

const mockContext = {
  userId: 'user-123',
  userEmail: 'test@example.com',
  userName: 'testuser',
  userRoles: ['USER'],
  userOrganizations: ['org-1'],
  userDepartment: 'IT',
  userClearanceLevel: 2,
  traceId: 'trace-123',
  correlationId: 'corr-123',
  clientIp: '192.168.1.100',
  userAgent: 'Mozilla/5.0',
  headers: {
    authorization: 'Bearer valid-token',
    'x-device-fingerprint': 'device-123',
    'x-device-trusted': 'true'
  }
};

const typeDefs = gql`
  type Query {
    organizations: [Organization!]!
    organization(organizationID: ID!): Organization
    getUser(userId: ID!): User
    organizationHello: String
  }
  
  type Mutation {
    createOrganization(input: CreateOrganizationInput!): Organization
    login(username: String!, password: String!): AuthResponse
  }
  
  type Organization {
    organizationID: ID!
    legalName: String
    brand: String
  }
  
  type User {
    userID: ID!
    username: String
    email: String
  }
  
  type AuthResponse {
    access_token: String!
    expires_in: Int!
  }
  
  input CreateOrganizationInput {
    legalName: String!
    brand: String!
  }
`;

const resolvers = {
  Query: {
    organizations: () => [{ organizationID: '1', legalName: 'Test Org', brand: 'Test' }],
    organization: (_, { organizationID }) => ({ organizationID, legalName: 'Test Org', brand: 'Test' }),
    getUser: (_, { userId }) => ({ userID: userId, username: 'testuser', email: 'test@example.com' }),
    organizationHello: () => 'Hello from Organization service'
  },
  Mutation: {
    createOrganization: (_, { input }) => ({ organizationID: '1', ...input }),
    login: (_, { username, password }) => ({ access_token: 'token', expires_in: 3600 })
  }
};

// =============================================================================
// TESTS UNITAIRES
// =============================================================================

describe('EnhancedOPAAuthPlugin - Tests Unitaires', () => {
  let plugin: EnhancedOPAAuthPlugin;
  let server: ApolloServer;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    plugin = createOPAAuthPlugin(mockAuthService, {
      enableMetrics: true,
      enableDetailedLogging: false,
      fallbackBehavior: 'deny',
      circuitBreaker: {
        enabled: false, // Désactiver pour les tests unitaires
        failureThreshold: 5,
        resetTimeout: 30000
      }
    });

    const schema = buildSubgraphSchema({ typeDefs, resolvers });
    
    server = new ApolloServer({
      schema,
      plugins: [plugin.plugin()]
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
    plugin.resetMetrics();
  });

  describe('Détection des opérations publiques', () => {
    it('devrait autoriser les requêtes d\'introspection', async () => {
      const query = `
        query IntrospectionQuery {
          __schema {
            queryType {
              name
            }
          }
        }
      `;

      const result = await server.executeOperation({
        query
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }
    });

    it('devrait autoriser les opérations publiques sans authentification', async () => {
      const query = `
        query {
          organizationHello
        }
      `;

      const result = await server.executeOperation({
        query
      }, {
        contextValue: { ...mockContext, userId: undefined, headers: {} }
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }
    });

    it('devrait autoriser la mutation login sans authentification', async () => {
      const mutation = `
        mutation {
          login(username: "test", password: "test") {
            access_token
            expires_in
          }
        }
      `;

      const result = await server.executeOperation({
        query: mutation
      }, {
        contextValue: { ...mockContext, userId: undefined, headers: {} }
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }
    });
  });

  describe('Authentification requise', () => {
    it('devrait rejeter les opérations privées sans token', async () => {
      const query = `
        query {
          organizations {
            organizationID
            legalName
          }
        }
      `;

      const result = await server.executeOperation({
        query
      }, {
        contextValue: { 
          ...mockContext, 
          userId: undefined, 
          headers: {} 
        }
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Authentication required');
      }
    });

    it('devrait rejeter les opérations avec token invalide', async () => {
      const query = `
        query {
          organizations {
            organizationID
          }
        }
      `;

      const invalidContext = {
        ...mockContext,
        headers: { authorization: 'Bearer invalid-token' }
      };

      mockAuthService.checkPermission.mockRejectedValue(new Error('Invalid token'));

      const result = await server.executeOperation({
        query
      }, {
        contextValue: invalidContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
      }
    });
  });

  describe('Autorisation OPA', () => {
    it('devrait autoriser l\'accès quand OPA retourne true', async () => {
      mockAuthService.checkPermission.mockResolvedValue(true);

      const query = `
        query {
          organizations {
            organizationID
            legalName
          }
        }
      `;

      const result = await server.executeOperation({
        query
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        expect(result.body.singleResult.data?.organizations).toBeDefined();
      }

      expect(mockAuthService.checkPermission).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String),
        'organization',
        'list',
        expect.objectContaining({
          ip: '192.168.1.100',
          traceId: 'trace-123'
        })
      );
    });

    it('devrait refuser l\'accès quand OPA retourne false', async () => {
      mockAuthService.checkPermission.mockResolvedValue(false);

      const query = `
        query GetSpecificOrganization {
          organization(organizationID: "sensitive-org-1") {
            organizationID
            legalName
          }
        }
      `;

      const result = await server.executeOperation({
        query
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Access denied');
      }
    });
  });

  describe('Gestion des erreurs et fallback', () => {
    it('devrait appliquer le fallback deny en cas d\'erreur OPA', async () => {
      mockAuthService.checkPermission.mockRejectedValue(new Error('OPA service unavailable'));

      const pluginWithDenyFallback = createOPAAuthPlugin(mockAuthService, {
        fallbackBehavior: 'deny'
      });

      const serverWithFallback = new ApolloServer({
        schema: buildSubgraphSchema({ typeDefs, resolvers }),
        plugins: [pluginWithDenyFallback.plugin()]
      });

      await serverWithFallback.start();

      const query = `
        query {
          organizations {
            organizationID
          }
        }
      `;

      const result = await serverWithFallback.executeOperation({
        query
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Authorization unavailable');
      }

      await serverWithFallback.stop();
    });

    it('devrait appliquer le fallback allow pour le développement', async () => {
      process.env.NODE_ENV = 'development';
      mockAuthService.checkPermission.mockRejectedValue(new Error('OPA service unavailable'));

      const pluginWithAllowFallback = createOPAAuthPlugin(mockAuthService, {
        fallbackBehavior: 'allow'
      });

      const serverWithFallback = new ApolloServer({
        schema: buildSubgraphSchema({ typeDefs, resolvers }),
        plugins: [pluginWithAllowFallback.plugin()]
      });

      await serverWithFallback.start();

      const query = `
        query {
          organizations {
            organizationID
          }
        }
      `;

      const result = await serverWithFallback.executeOperation({
        query
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        expect(result.body.singleResult.data?.organizations).toBeDefined();
      }

      await serverWithFallback.stop();
    });
  });

  describe('Métriques et monitoring', () => {
    it('devrait collecter les métriques correctement', async () => {
      mockAuthService.checkPermission.mockResolvedValue(true);

      // Exécuter plusieurs requêtes
      for (let i = 0; i < 3; i++) {
        await server.executeOperation({
          query: `query { organizations { organizationID } }`
        }, {
          contextValue: mockContext
        });
      }

      const metrics = plugin.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.allowedRequests).toBe(3);
      expect(metrics.deniedRequests).toBe(0);
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('devrait reset les métriques', () => {
      plugin.resetMetrics();
      const metrics = plugin.getMetrics();
      
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.allowedRequests).toBe(0);
      expect(metrics.deniedRequests).toBe(0);
      expect(metrics.averageLatency).toBe(0);
    });
  });
});

// =============================================================================
// TESTS D'INTÉGRATION
// =============================================================================

describe('EnhancedOPAAuthPlugin - Tests d\'Intégration', () => {
  let plugin: EnhancedOPAAuthPlugin;
  let server: ApolloServer;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    plugin = createOPAAuthPlugin(mockAuthService, {
      enableMetrics: true,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
        resetTimeout: 1000
      }
    });

    server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
      plugins: [plugin.plugin()]
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
  });

  describe('Circuit Breaker', () => {
    it('devrait ouvrir le circuit breaker après plusieurs échecs', async () => {
      // Simuler des échecs OPA
      mockAuthService.checkPermission.mockRejectedValue(new Error('OPA Error'));

      const query = `query { organizations { organizationID } }`;

      // Premier échec
      await server.executeOperation({ query }, { contextValue: mockContext });
      
      // Deuxième échec - devrait ouvrir le circuit breaker
      await server.executeOperation({ query }, { contextValue: mockContext });

      // Troisième appel - devrait échouer immédiatement à cause du circuit breaker
      const result = await server.executeOperation({ query }, { contextValue: mockContext });

      const metrics = plugin.getMetrics();
      expect(metrics.circuitBreakerOpen).toBe(true);
      expect(metrics.errors).toBeGreaterThan(0);
    });
  });

  describe('Scenarios réels', () => {
    it('devrait gérer un workflow complet de création d\'organisation', async () => {
      // 1. Vérification des permissions pour lister les organisations
      mockAuthService.checkPermission.mockResolvedValueOnce(true);
      
      const listQuery = `query { organizations { organizationID legalName } }`;
      
      let result = await server.executeOperation({
        query: listQuery
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }

      // 2. Vérification des permissions pour créer une organisation
      mockAuthService.checkPermission.mockResolvedValueOnce(true);
      
      const createMutation = `
        mutation CreateOrg {
          createOrganization(input: { legalName: "New Org", brand: "NewBrand" }) {
            organizationID
            legalName
          }
        }
      `;

      result = await server.executeOperation({
        query: createMutation
      }, {
        contextValue: mockContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
        // expect(result.body.singleResult.data?.createOrganization?.legalName).toBe('New Org');
      }

      // Vérifier que les bonnes permissions ont été vérifiées
      expect(mockAuthService.checkPermission).toHaveBeenCalledTimes(2);
      expect(mockAuthService.checkPermission).toHaveBeenNthCalledWith(1,
        'valid-token', 'organizations_resource', 'organization', 'list', expect.any(Object)
      );
      expect(mockAuthService.checkPermission).toHaveBeenNthCalledWith(2,
        'valid-token', 'createOrganization_resource', 'organization', 'create', expect.any(Object)
      );
    });

    it('devrait gérer différents rôles utilisateur', async () => {
      // Test avec utilisateur admin
      const adminContext = {
        ...mockContext,
        userRoles: ['ADMIN', 'USER'],
        userClearanceLevel: 5
      };

      mockAuthService.checkPermission.mockResolvedValue(true);

      const sensitiveQuery = `query { getUser(userId: "sensitive-user-123") { userID email } }`;
      
      let result = await server.executeOperation({
        query: sensitiveQuery
      }, {
        contextValue: adminContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }

      // Test avec utilisateur normal - refusé
      mockAuthService.checkPermission.mockResolvedValue(false);

      const normalUserContext = {
        ...mockContext,
        userRoles: ['USER'],
        userClearanceLevel: 1
      };

      result = await server.executeOperation({
        query: sensitiveQuery
      }, {
        contextValue: normalUserContext
      });

      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeDefined();
        expect(result.body.singleResult.errors?.[0].message).toContain('Access denied');
      }
    });
  });
});

// =============================================================================
// TESTS DE PERFORMANCE ET CHARGE
// =============================================================================

describe('EnhancedOPAAuthPlugin - Tests de Performance', () => {
  let plugin: EnhancedOPAAuthPlugin;
  let server: ApolloServer;

  beforeEach(async () => {
    plugin = createOPAAuthPlugin(mockAuthService);
    
    server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
      plugins: [plugin.plugin()]
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
  });

  it('devrait gérer un volume élevé de requêtes simultanées', async () => {
    mockAuthService.checkPermission.mockResolvedValue(true);
    
    const query = `query { organizations { organizationID } }`;
    const concurrentRequests = 50;
    
    const startTime = Date.now();
    
    const promises = Array(concurrentRequests).fill(null).map(() =>
      server.executeOperation({ query }, { contextValue: mockContext })
    );
    
    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    console.log(`🚀 ${concurrentRequests} requêtes simultanées traitées en ${duration}ms`);
    console.log(`📊 Moyenne: ${(duration / concurrentRequests).toFixed(2)}ms par requête`);
    
    // Vérifier que toutes les requêtes ont réussi
    results.forEach((result, index) => {
      expect(result.body.kind).toBe('single');
      if (result.body.kind === 'single') {
        expect(result.body.singleResult.errors).toBeUndefined();
      }
    });

    const metrics = plugin.getMetrics();
    expect(metrics.totalRequests).toBe(concurrentRequests);
    expect(metrics.allowedRequests).toBe(concurrentRequests);
    expect(metrics.averageLatency).toBeLessThan(100); // Moins de 100ms en moyenne
  });

  it('devrait maintenir de bonnes performances même avec des timeouts OPA', async () => {
    // Simuler des réponses lentes d'OPA
    mockAuthService.checkPermission.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(true), 50))
    );

    const query = `query { organizations { organizationID } }`;
    const iterations = 10;
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await server.executeOperation({ query }, { contextValue: mockContext });
    }
    
    const duration = Date.now() - startTime;
    const avgLatency = duration / iterations;
    
    console.log(`⏱️ Latence moyenne avec OPA lent: ${avgLatency.toFixed(2)}ms`);
    
    expect(avgLatency).toBeLessThan(200); // Acceptable pour des cas d'usage réels
  });
});

// =============================================================================
// TESTS DE RÉGRESSION ET EDGE CASES
// =============================================================================

describe('EnhancedOPAAuthPlugin - Tests de Régression', () => {
  let plugin: EnhancedOPAAuthPlugin;

  beforeEach(() => {
    plugin = createOPAAuthPlugin(mockAuthService);
  });

  describe('Extraction des informations de ressource', () => {
    it('devrait gérer les mutations complexes avec inputs imbriqués', () => {
      const mockOperation = {
        operation: 'mutation',
        selectionSet: {
          selections: [{
            name: { value: 'createUserOrganization' },
            arguments: [{
              name: { value: 'input' },
              value: {
                fields: [
                  { name: { value: 'userID' }, value: { value: 'user-456' } },
                  { name: { value: 'organizationId' }, value: { value: 'org-789' } }
                ]
              }
            }]
          }]
        }
      };

      const resourceInfo = (plugin as any).extractResourceInfo(mockOperation, 'createUserOrganization');
      
      expect(resourceInfo.resourceType).toBe('user_organization');
      expect(resourceInfo.action).toBe('create');
      expect(resourceInfo.organizationId).toBe('org-789');
    });

    it('devrait gérer les queries sans arguments', () => {
      const mockOperation = {
        operation: 'query',
        selectionSet: {
          selections: [{
            name: { value: 'organizations' },
            arguments: []
          }]
        }
      };

      const resourceInfo = (plugin as any).extractResourceInfo(mockOperation, 'organizations');
      
      expect(resourceInfo.resourceType).toBe('organization');
      expect(resourceInfo.action).toBe('list');
    });

    it('devrait gérer les opérations malformées', () => {
      const mockOperation = null;

      const resourceInfo = (plugin as any).extractResourceInfo(mockOperation, 'unknownOp');
      
      expect(resourceInfo.resourceType).toBe('graphql_query');
      expect(resourceInfo.resourceId).toBe('unknownOp');
      expect(resourceInfo.action).toBe('read');
    });
  });

  describe('Calcul du score de risque', () => {
    it('devrait calculer un score de risque élevé pour connexions suspectes', () => {
      const suspiciousContext = {
        ...mockContext,
        clientIp: '1.2.3.4', // IP externe
        userAgent: 'curl/7.68.0', // Outil automatisé
        headers: {
          ...mockContext.headers,
          'x-tor-exit-node': 'true',
          'x-device-trusted': 'false'
        }
      };

      const riskScore = (plugin as any).calculateRiskScore(suspiciousContext);
      expect(riskScore).toBeGreaterThan(50);
    });

    it('devrait calculer un score de risque faible pour connexions normales', () => {
      const normalContext = {
        ...mockContext,
        clientIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Chrome)',
        headers: {
          ...mockContext.headers,
          'x-device-trusted': 'true'
        }
      };

      const riskScore = (plugin as any).calculateRiskScore(normalContext);
      expect(riskScore).toBeLessThan(30);
    });
  });
});

export class OPAPluginTestUtils {
  static createMockContext(overrides?: Partial<typeof mockContext>) {
    return {
      ...mockContext,
      ...overrides,
      traceId: `trace-${Date.now()}`,
      correlationId: `corr-${Date.now()}`
    };
  }

  static createMockOperation(
    operationType: 'query' | 'mutation',
    fieldName: string,
    args?: Record<string, any>
  ) {
    const arguments_array = args ? Object.entries(args).map(([name, value]) => ({
      name: { value: name },
      value: { value }
    })) : [];

    return {
      operation: operationType,
      selectionSet: {
        selections: [{
          name: { value: fieldName },
          arguments: arguments_array
        }]
      }
    };
  }

  static async performLoadTest(
    server: ApolloServer,
    query: string,
    context: any,
    options: {
      concurrentUsers: number;
      duration: number; // en millisecondes
    }
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageLatency: number;
    throughput: number; // requêtes par seconde
  }> {
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0
    };

    const startTime = Date.now();
    const endTime = startTime + options.duration;
    
    const userPromises = Array(options.concurrentUsers).fill(null).map(async () => {
      while (Date.now() < endTime) {
        const requestStart = Date.now();
        results.totalRequests++;
        
        try {
          await server.executeOperation({ query }, { contextValue: context });
          results.successfulRequests++;
        } catch {
          results.failedRequests++;
        }
        
        results.totalLatency += Date.now() - requestStart;
        
        // Petit délai pour éviter de saturer
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    await Promise.all(userPromises);
    
    const actualDuration = Date.now() - startTime;
    
    return {
      totalRequests: results.totalRequests,
      successfulRequests: results.successfulRequests,
      failedRequests: results.failedRequests,
      averageLatency: results.totalLatency / results.totalRequests,
      throughput: (results.totalRequests / actualDuration) * 1000
    };
  }
}

// =============================================================================
// EXEMPLE DE TEST D'INTÉGRATION AVEC OPA RÉEL
// =============================================================================

describe('EnhancedOPAAuthPlugin - Tests avec OPA Réel', () => {
  // Ces tests nécessitent un serveur OPA en cours d'exécution
  const isOPAAvailable = process.env.OPA_URL && process.env.TEST_WITH_REAL_OPA === 'true';
  
  if (!isOPAAvailable) {
    it.skip('Tests OPA réels désactivés (définir TEST_WITH_REAL_OPA=true et OPA_URL)', () => {});
    return;
  }

  let realAuthService: IAuthenticationService;
  let plugin: EnhancedOPAAuthPlugin;
  let server: ApolloServer;

  beforeEach(async () => {
    // Créer un service d'auth réel pour les tests d'intégration
    const { createAuthServiceFromEnv } = await import('smp-auth-ts');
    realAuthService = createAuthServiceFromEnv();
    
    plugin = createOPAAuthPlugin(realAuthService);
    
    server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
      plugins: [plugin.plugin()]
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
    await realAuthService?.close();
  });

  it('devrait fonctionner avec des politiques OPA réelles', async () => {
    const query = `query { organizations { organizationID legalName } }`;
    
    const result = await server.executeOperation({
      query
    }, {
      contextValue: {
        ...mockContext,
        // Utiliser un vrai token pour les tests d'intégration
        headers: { authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` }
      }
    });

    // Le résultat dépendra de vos politiques OPA réelles
    expect(result.body.kind).toBe('single');
    
    if (result.body.kind === 'single') {
      // Soit succès, soit erreur d'autorisation explicite
      if (result.body.singleResult.errors) {
        expect(result.body.singleResult.errors[0].message).toMatch(
          /(Access denied|Authentication required|Authorization)/
        );
      } else {
        expect(result.body.singleResult.data).toBeDefined();
      }
    }
  });
});

describe('EnhancedOPAAuthPlugin - Tests avec OPA Réel', () => {
  // Ces tests nécessitent un serveur OPA en cours d'exécution
  const isOPAAvailable = process.env.OPA_URL && process.env.TEST_WITH_REAL_OPA === 'true';
  
  if (!isOPAAvailable) {
    it.skip('Tests OPA réels désactivés (définir TEST_WITH_REAL_OPA=true et OPA_URL)', () => {});
    return;
  }

  let realAuthService: IAuthenticationService;
  let plugin: EnhancedOPAAuthPlugin;
  let server: ApolloServer;

  beforeEach(async () => {
    // Créer un service d'auth réel pour les tests d'intégration
    const { createAuthServiceFromEnv } = await import('smp-auth-ts');
    realAuthService = createAuthServiceFromEnv();
    
    plugin = createOPAAuthPlugin(realAuthService);
    
    server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
      plugins: [plugin.plugin()]
    });

    await server.start();
  });

  afterEach(async () => {
    await server?.stop();
    await realAuthService?.close();
  });

  it('devrait fonctionner avec des politiques OPA réelles', async () => {
    const query = `query { organizations { organizationID legalName } }`;
    
    const result = await server.executeOperation({
      query
    }, {
      contextValue: {
        ...mockContext,
        // Utiliser un vrai token pour les tests d'intégration
        headers: { authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` }
      }
    });

    // Le résultat dépendra de vos politiques OPA réelles
    expect(result.body.kind).toBe('single');
    
    if (result.body.kind === 'single') {
      // Soit succès, soit erreur d'autorisation explicite
      if (result.body.singleResult.errors) {
        expect(result.body.singleResult.errors[0].message).toMatch(
          /(Access denied|Authentication required|Authorization)/
        );
      } else {
        expect(result.body.singleResult.data).toBeDefined();
      }
    }
  });
});

// =============================================================================
// EXEMPLE DE CONFIGURATION DE TEST JEST
// =============================================================================

export const jestConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true
};
