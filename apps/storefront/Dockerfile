# ==============================================================================
# Production Dockerfile for Supershop Storefront (apps/storefront)
# Multi-stage: Node build -> Node runtime (Next.js 16 SSR)
# ==============================================================================

# Stage 1: Build Next.js application
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production

# Copy package manifests for workspace caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/storefront/package.json apps/storefront/

# Install build dependencies
RUN npm ci --workspace=@supershop/shared --workspace=@supershop/ui --workspace=@supershop/storefront

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY apps/storefront/ apps/storefront/

# Build Next.js application
ARG API_PUBLIC_URL=http://localhost:4000
ENV API_PUBLIC_URL=${API_PUBLIC_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w apps/storefront

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/storefront/package.json apps/storefront/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@supershop/shared --workspace=@supershop/ui --workspace=@supershop/storefront

# Copy built artifacts and source
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY --from=builder /app/apps/storefront /app/apps/storefront

# Run as non-root user
RUN useradd -m -u 1001 nextjs && \
    chown -R nextjs:nextjs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/ || exit 1

CMD ["npm", "run", "start", "-w", "apps/storefront"]
