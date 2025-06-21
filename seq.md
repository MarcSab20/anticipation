sequenceDiagram
    participant Client
    participant KrakenD
    participant MuAuth as mu-auth Service
    participant Keycloak
    participant Redis
    participant PostgreSQL

    Note over Client,PostgreSQL: Authentification utilisateur

    Client->>KrakenD: POST /api/auth/login {username, password}
    
    KrakenD->>MuAuth: HTTP POST /auth/login {username, password}
    
    MuAuth->>Keycloak: OAuth2 Password Grant
    Note right of MuAuth: Via smp-auth-ts
    
    Keycloak-->>MuAuth: {access_token, refresh_token, user_info}
    
    MuAuth->>Redis: Store session + cache user info  
    Note right of MuAuth: Via smp-auth-ts
    
    MuAuth->>PostgreSQL: Sync/Update user data
    
    MuAuth-->>KrakenD: {access_token, refresh_token, user_info}
    
    KrakenD-->>Client: {access_token, refresh_token, expires_in}