#!/bin/bash

# Create src directory and its sub-directories
mkdir -p src/config src/controllers src/models src/routes src/middleware src/utils src/services src/graphql/resolvers src/graphql/schema src/tests/integration src/tests/unit
mkdir -p src/enums src/graphql/enums

# Create other directories
mkdir public views scripts logs docs migrations .github seeds initdb

# Create common files
touch README.md .dockerignore Dockerfile .env .env.dev env.int env.prod .env.example .gitignore package.json
touch src/models/index.js src/index.js src/routes/index.js src/middleware/index.js src/graphql/resolvers/index.js src/graphql/schema/index.js src/controllers/index.js src/config/db.js
# If using TypeScript, also create tsconfig.json
# touch tsconfig.json

echo "Directory structure generated!"
echo "Initiating npm now with dependencies"
echo """
LOG_LEVEL: ${LOG_LEVEL:-debug}
DB_HOST: db
DB_USER: bbservices
DB_PASSWORD: Service2019PostgresSQL
DB_NAME: services
DB_PORT: 5432
REDIS_HOST: redis

""" > .env.example
npm init -y
npm install redis compression helmet winston winston-logstash @apollo/datasource-rest jwt @graphql-yoga/plugin-jwt
npm install @apollo/server body-parser cors pg uuid jsonwebtoken bcryptjs mongoose sequelize
npm install @graphql-tools/schema @graphql-tools/merge graphql-subscriptions kafkajs graphql-kafka-subscriptions
npm install @graphql-tools/load-files @graphql-yoga/plugin-response-cache slugify 
npm install @graphql-tools/graphql-file-loader @graphql-tools/load @envelop/response-cache-redis
npm install @escape.tech/graphql-armor-cost-limit @escape.tech/graphql-armor-max-aliases @escape.tech/graphql-armor-max-depth @escape.tech/graphql-armor-max-directives @escape.tech/graphql-armor-max-tokens
npm install @opentelemetry/api @opentelemetry/node @opentelemetry/tracing @opentelemetry/exporter-trace-otlp-http