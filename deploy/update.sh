#!/usr/bin/env bash
# Pull the latest code and restart. Run from the repo folder on the server:
#   bash deploy/update.sh            (deploys the branch you're on)
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
echo "Deployed $(git rev-parse --short HEAD). Logs: docker compose logs -f app"
