# Étape de construction
FROM node:lts AS builder

# Créer le dossier de travail
WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer npm dans une version stable
RUN npm install -g npm@11.2.0

# Copier le reste du code source
COPY . .

# Installer les dépendances du projet (inclut dotenv)
RUN npm install

# Construire l'application (si applicable)
RUN npm run build

# Étape de production
FROM node:lts

# Installer PM2 globalement
RUN npm install -g pm2

# Créer un utilisateur non-root
RUN groupadd -r smp-group && \
    useradd -r -s /bin/bash -g smp-group smp-user && \
    mkdir -p /home/smp-user && \
    chown -R smp-user:smp-group /home/smp-user

# Définir le dossier de travail
WORKDIR /home/smp-user

# Copier l'application depuis l'étape builder
COPY --from=builder --chown=smp-user:smp-group /usr/src/app ./

# Créer le dossier de PM2
RUN mkdir -p /home/smp-user/.pm2 && \
    chown -R smp-user:smp-group /home/smp-user/.pm2

# Définir la variable d’environnement PM2
ENV PM2_HOME=/home/smp-user/.pm2

# Passer en utilisateur non-root
USER smp-user

# Exposer le port utilisé par ton app
EXPOSE 4000

# Lancer l’application avec l'environnement souhaité
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
