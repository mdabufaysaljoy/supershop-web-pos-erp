# ==============================================================================
# Production Dockerfile for Supershop API (apps/api)
# Multi-stage build targeting Debian slim for glibc native addons (argon2, sharp)
# ==============================================================================

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install curl for health check and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests for workspace caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install production dependencies for @supershop/shared and @supershop/api only
RUN npm ci --omit=dev --workspace=@supershop/shared --workspace=@supershop/api

# Copy source code
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Create runtime directories for media uploads and temporary backups
RUN mkdir -p /app/var/media /app/var/backups && \
    chown -R node:node /app

USER node
EXPOSE 4000

# Health check using the API liveness endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:4000/api/v1/health || exit 1

CMD ["node", "apps/api/src/server.js"]
