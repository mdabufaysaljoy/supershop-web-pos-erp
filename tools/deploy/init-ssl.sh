#!/usr/bin/env bash
# ==============================================================================
# SSL Certificate Initialization Script for Supershop (P10.4)
# Sets up bootstrap certificates so Nginx starts, then requests Let's Encrypt certificates.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load .env.production if present
if [ -f "${ROOT_DIR}/.env.production" ]; then
  set -a
  # shellcheck source=/dev/null
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ROOT_DIR}/.env.production" | sed 's/\r$//')
  set +a
fi

DOMAINS="${DOMAINS:-example.com,admin.example.com,api.example.com}"
EMAIL="${SSL_EMAIL:-admin@example.com}"
CERT_DIR="${ROOT_DIR}/tools/deploy/nginx/ssl/live/supershop"
STAGING="${CERT_STAGING:-0}" # Set to 1 for Let's Encrypt staging environment

echo "==> Initializing SSL setup for domains: ${DOMAINS}"

mkdir -p "${CERT_DIR}"

# Step 1: Create dummy certificate if fullchain does not exist
if [ ! -f "${CERT_DIR}/fullchain.pem" ]; then
  echo "--> Generating bootstrap self-signed certificate..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=localhost"
  echo "--> Bootstrap certificate generated."
fi

# Step 2: Inform how to request real certificates
echo ""
echo "======================================================================"
echo "Bootstrap certificates are ready. Next steps to acquire Let's Encrypt:"
echo "1. Ensure DNS A records for (${DOMAINS}) point to this server IP."
echo "2. Start nginx: docker compose -f docker-compose.prod.yml up -d nginx"
echo "3. Run Certbot to acquire real certificates:"
echo "   docker compose -f docker-compose.prod.yml run --rm certbot certonly \\"
echo "     --webroot -w /var/www/certbot \\"
echo "     -d ${DOMAINS//,/ -d } \\"
echo "     --email ${EMAIL} \\"
echo "     --agree-tos --no-eff-email --force-renewal"
echo "4. Reload nginx: docker compose -f docker-compose.prod.yml exec nginx nginx -s reload"
echo "======================================================================"
