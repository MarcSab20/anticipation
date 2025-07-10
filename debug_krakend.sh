#!/bin/bash

echo "=== Diagnostic KrakenD - Étape par étape ==="

# 1. Est-ce que KrakenD répond du tout ?
echo "1. Test de base - KrakenD répond-il ?"
echo "Command: curl -v http://localhost:8090"
curl -v http://localhost:8090 2>&1 | head -15
echo ""

# 2. Vérifier si KrakenD écoute sur le bon port
echo "2. Vérification des ports en écoute:"
netstat -tlnp | grep :8090 || echo "❌ Port 8090 pas en écoute"
echo ""

# 3. Status du container KrakenD
echo "3. Status du container KrakenD:"
docker ps | grep krakend || echo "❌ Container KrakenD pas trouvé"
echo ""

# 4. Logs KrakenD en temps réel pendant une requête
echo "4. Test avec logs en temps réel..."
echo "Démarrage du monitoring des logs KrakenD..."

# Lancer les logs en arrière-plan
docker logs -f $(docker ps -q -f "name=krakend") &
LOG_PID=$!

# Attendre un peu puis faire une requête
sleep 2
echo "Envoi d'une requête de test..."
curl -v -X POST http://localhost:8090/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"username":"marco","password":"password"}' \
  2>&1 | head -20

# Arrêter les logs après 5 secondes
sleep 5
kill $LOG_PID 2>/dev/null

echo ""
echo "5. Configuration KrakenD actuelle:"
docker exec $(docker ps -q -f "name=krakend") cat /etc/krakend/krakend.json | jq '.endpoints[].endpoint' 2>/dev/null || echo "❌ Impossible de lire la config KrakenD"

echo ""
echo "6. Test de connectivité réseau depuis KrakenD:"
docker exec $(docker ps -q -f "name=krakend") sh -c "
echo 'Test ping vers mu-auth:'
ping -c 1 mu-auth 2>/dev/null || echo '❌ mu-auth inaccessible'
echo 'Test curl vers mu-auth:'
curl -s http://mu-auth:3001/auth/health || echo '❌ mu-auth HTTP inaccessible'
" 2>/dev/null || echo "❌ Impossible d'accéder au container KrakenD"

echo ""
echo "=== Fin du diagnostic rapide ==="