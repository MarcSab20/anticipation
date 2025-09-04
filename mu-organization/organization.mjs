import http from 'http';
import express from 'express';
import cors from 'cors';
import { hostname } from 'os'; 
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { appConfig, updateContext, cache, rabbitMQConfig, RabbitMQService,requestUUIDMiddleware, requestCounter, } from 'smp-core-tools';
import { models } from './src/index.js';
import { muConsumers } from './rabbitmq/index.js'; 
import { typeDefs, resolvers } from './src/graphql/index.js';
import fs from 'fs';
import https from 'https';

// Création unique du service RabbitMQ
//const rabbitMQService = new RabbitMQService(`${rabbitMQConfig.url}:${rabbitMQConfig.port}`, models, muConsumers);
//rabbitMQService.startEventHandler();

// Construction du contexte GraphQL pour chaque requête
const buildContext = async () => {
  const ctxt = {
    ...updateContext({}),
    config: appConfig,
    event: rabbitMQService,
    logger: console,
  };
  ctxt.logger.info('ENV:', appConfig.envExc);
  return ctxt;
};

let server;
let httpServer;

async function main() {
  // Initialisation du cache (si nécessaire)
  // cache.promiseClient();

  // Construction du schéma de sous-graphe pour Apollo Federation
  const subgraphSchema = buildSubgraphSchema({ typeDefs, resolvers });

  // Création de l'application Express et du serveur HTTP associé
  const app = express();
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    const options = {
      key: fs.readFileSync(process.env.KEY_PATH),
      cert: fs.readFileSync(process.env.CERT_PATH),
      ca: fs.readFileSync(process.env.CA_PATH), // si nécessaire
      requestCert: true,
      rejectUnauthorized: true,
    };
    httpServer = https.createServer(options, app);

  } else {
    
    httpServer = http.createServer(app);
  }

  // Création d'Apollo Server avec plugin de drainage et introspection forcée
  server = new ApolloServer({
    schema: subgraphSchema,
    introspection: true, // Activer l'introspection
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              console.log('\n');
              console.log(`${appConfig.componentName}: Draining Apollo Server....`);
              await server.stop();
              console.log(`${appConfig.componentName}: Apollo Server stopped.`);
            },
          };
        },
      },
    ],
  });

  // Démarrage d'Apollo Server
  await server.start();

  // Montage des middlewares Express
  app.use(
    '/graphql',
    cors(), 
    express.json(), // Middleware pour parser le JSON
    expressMiddleware(server, { context: buildContext }),
   requestCounter,
   requestUUIDMiddleware
  );


  // Démarrage du serveur HTTP
  // server.applyMiddleware({ app, path: '/' });
  const graphqlPath = "/graphql"
  httpServer.listen({port:appConfig.apiPort}, () => {
    if(hostname().includes('local') || hostname().includes('home') || !hostname().includes('.')){
      console.log(`🚀 [${ new Date()}]\nAuthentication ready at http://localhost:${appConfig.apiPort}${graphqlPath}`);
    } else {
      console.log(`🚀 [${ new Date()}]\nAuthentication ready at http://authentication.api.services.ceo:${appConfig.apiPort}${graphqlPath}`);
    }
  });
} 


main().catch((error) => {
  console.error('Error starting the server:', error);
  process.exit(1);
});

//export { rabbitMQService };