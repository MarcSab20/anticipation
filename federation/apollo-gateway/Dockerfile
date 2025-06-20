FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json ./

# Installer les dépendances (générer un nouveau package-lock.json)
RUN npm install --production --no-package-lock

# Copier le code source
COPY src/ ./src/

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=4000
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["node", "src/index.js"]