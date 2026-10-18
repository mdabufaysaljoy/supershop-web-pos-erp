#!/usr/bin/env bash
# ==============================================================================
# Production Deployment Script for Supershop (P10.4)
# Automates image building, database index sync, zero-downtime restart, and health verification.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}"

ENV_FILE="${ROOT_DIR}/.env.production"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

echo "======================================================================"
echo "==> Starting Supershop Production Deployment"
echo "    Timestamp: $(date -u +"%Y-%m-%d %H:%M:%SZ")"
echo "======================================================================"

# Verify configuration file
if [ ! -f "${ENV_FILE}" ]; then
  echo "Error: ${ENV_FILE} not found. Please create it from .env.production.example" >&2
  exit 1
fi

# Step 1: Build production container images
echo "--> Step 1: Building production container images..."
docker compose -f "${COMPOSE_FILE}" build

# Step 2: Ensure infrastructure services (Mongo, Redis) are running and healthy
echo "--> Step 2: Starting database and caching infrastructure..."
docker compose -f "${COMPOSE_FILE}" up -d mongo redis

echo "--> Waiting for database readiness..."
docker compose -f "${COMPOSE_FILE}" exec -T mongo mongosh --quiet --eval \
  "let ok = false; for(let i=0; i<30; i++) { try { if (rs.status().ok) { ok = true; break; } } catch(e){} sleep(1000); } quit(ok ? 0 : 1);"

# Step 3: Synchronize database indexes
echo "--> Step 3: Synchronizing database indexes..."
docker compose -f "${COMPOSE_FILE}" run --rm api node apps/api/src/core/ensureIndexes.js

# Step 4: Gracefully restart application containers
echo "--> Step 4: Deploying application containers..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans api admin storefront nginx

# Step 5: Post-deployment health verification
echo "--> Step 5: Verifying health check endpoints..."

MAX_ATTEMPTS=15
ATTEMPT=1
HEALTHY=false

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  echo "    [Attempt $ATTEMPT/$MAX_ATTEMPTS] Probing API readiness..."
  if docker compose -f "${COMPOSE_FILE}" exec -T api curl -s -f http://127.0.0.1:4000/api/v1/health/ready >/dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  sleep 2
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$HEALTHY" = false ]; then
  echo "Error: API readiness probe failed after $MAX_ATTEMPTS attempts." >&2
  echo "Container logs:" >&2
  docker compose -f "${COMPOSE_FILE}" logs --tail=50 api >&2
  exit 1
fi

echo "--> API readiness check: PASSED"

# Verify Storefront probe
if docker compose -f "${COMPOSE_FILE}" exec -T storefront curl -s -f http://127.0.0.1:3000/ >/dev/null 2>&1; then
  echo "--> Storefront check: PASSED"
else
  echo "Warning: Storefront response check returned non-200, continuing."
fi

echo "======================================================================"
echo "==> Supershop Deployment Completed Successfully!"
echo "======================================================================"
