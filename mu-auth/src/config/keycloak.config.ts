export interface KeycloakConfig {
    serverUrl: string;
    realm: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint: string;
  }
  
  export const defaultKeycloakConfig: KeycloakConfig = {
    serverUrl: process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080/auth',
    realm: process.env.KEYCLOAK_REALM || 'master',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'client',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || 'secret',
    tokenEndpoint: '/protocol/openid-connect/token'
  };