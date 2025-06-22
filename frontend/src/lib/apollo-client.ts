import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { getAuthToken, removeAuth } from './auth.storage';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:8090/graphql',
});

// Link d'authentification qui ajoute le token JWT
const authLink = setContext((_, { headers }) => {
  const token = getAuthToken();
  
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
      'X-Request-ID': crypto.randomUUID(),
      'X-Client-Version': '1.0.0',
      'X-Client-Source': 'web-app'
    }
  };
});

// Link de gestion d'erreurs
const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path, extensions }) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
      );
      
      // Gestion des erreurs d'authentification
      if (extensions?.code === 'UNAUTHENTICATED' || message.includes('Authentication required')) {
        removeAuth();
        window.location.href = '/login';
      }
      
      // Gestion des erreurs d'autorisation
      if (extensions?.code === 'FORBIDDEN' || message.includes('Access denied')) {
        console.warn('Access denied:', message);
        // Optionnel: rediriger vers page d'erreur 403
      }
    });
  }

  if (networkError) {
    console.error(`[Network error]: ${networkError}`);
    
    // Gestion des erreurs réseau spécifiques
    if ('statusCode' in networkError) {
      switch (networkError.statusCode) {
        case 401:
          removeAuth();
          window.location.href = '/login';
          break;
        case 403:
          console.warn('Access forbidden');
          break;
        case 503:
          console.error('Service unavailable');
          break;
      }
    }
  }
});

// Configuration du cache Apollo
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Configuration du cache pour les organisations
        userOrganizations: {
          merge(existing = [], incoming) {
            return incoming;
          }
        },
        // Configuration du cache pour les utilisateurs
        users: {
          merge(existing = [], incoming) {
            return incoming;
          }
        }
      }
    },
    User: {
      keyFields: ['id'],
      fields: {
        organizations: {
          merge(existing = [], incoming) {
            return incoming;
          }
        }
      }
    },
    Organization: {
      keyFields: ['id'],
      fields: {
        members: {
          merge(existing = [], incoming) {
            return incoming;
          }
        }
      }
    }
  }
});

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all'
    },
    query: {
      errorPolicy: 'all'
    }
  }
});