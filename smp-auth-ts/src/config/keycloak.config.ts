export interface KeycloakConfig {
    serverUrl: string;
    realm: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
  }
  
  export const defaultKeycloakConfig: KeycloakConfig = {
    serverUrl: process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'mu-realm',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'mu-client',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'secret',
    tokenEndpoint: '/protocol/openid-connect/token'
  };