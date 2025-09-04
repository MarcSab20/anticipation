#!/bin/bash
set -e

# Récupération des secrets
DB_USER=$(<"/run/secrets/auth_db_username")
DB_PASSWORD=$(<"/run/secrets/auth_db_pswd")
DB_NAME=$(<"/run/secrets/auth_db_name")

# Utilisation de variables d'environnement pour les noms d'utilisateur, les mots de passe, etc.
CUSTOM_DB_NAME=${DB_NAME:-postgres}
CUSTOM_USER=${DB_USER:-postgres}
CUSTOM_PASSWORD=${DB_PASSWORD:-""}

# Création d'une base de données customisée
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE $CUSTOM_DB;
    GRANT ALL PRIVILEGES ON DATABASE $CUSTOM_DB TO $POSTGRES_USER;
EOSQL

# Création d'un utilisateur supplémentaire
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER $CUSTOM_USER WITH PASSWORD '$CUSTOM_PASSWORD';
    ALTER ROLE $CUSTOM_USER SET client_encoding TO 'utf8';
    ALTER ROLE $CUSTOM_USER SET default_transaction_isolation TO 'read committed';
    ALTER ROLE $CUSTOM_USER SET timezone TO 'UTC';
    GRANT ALL PRIVILEGES ON DATABASE $CUSTOM_DB TO $CUSTOM_USER;
EOSQL
