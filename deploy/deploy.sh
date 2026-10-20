#!/usr/bin/env bash
# Builds Wolf here, ships the image to the Droplet and restarts the stack there.
# (The ClutchX3D shop is not deployed yet.)
# Usage: deploy/deploy.sh            (host defaults to the "wolf-do" entry in ~/.ssh/config)
#        DEPLOY_HOST=root@1.2.3.4 deploy/deploy.sh
set -euo pipefail
HOST="${DEPLOY_HOST:-wolf-do}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building images"
docker build -q -t wolf:latest "$ROOT/wolf"

echo "==> Shipping images to $HOST"
docker save wolf:latest | gzip -1 | ssh "$HOST" 'gunzip | docker load'

echo "==> Restarting"
ssh "$HOST" 'mkdir -p /opt/wolf'
scp -q "$ROOT/deploy/docker-compose.yml" "$ROOT/deploy/Caddyfile" "$HOST:/opt/wolf/"
ssh "$HOST" 'cd /opt/wolf && test -f .env || { echo "Missing /opt/wolf/.env on the server"; exit 1; }
  docker compose up -d --remove-orphans && docker image prune -f >/dev/null && docker compose ps'
