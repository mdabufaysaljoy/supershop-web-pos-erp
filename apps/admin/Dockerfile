# ==============================================================================
# Production Dockerfile for Supershop Admin SPA (apps/admin)
# Multi-stage: Node build -> Nginx Alpine static serving
# ==============================================================================

# Stage 1: Build static assets
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Copy package manifests for workspace caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/admin/package.json apps/admin/

# Install dependencies needed to build the admin SPA
RUN npm ci --workspace=@supershop/shared --workspace=@supershop/ui --workspace=@supershop/admin

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/ui/ packages/ui/
COPY apps/admin/ apps/admin/

# Build argument for API URL if custom base is needed
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

# Build static bundle to /app/apps/admin/dist
RUN npm run build -w apps/admin

# Stage 2: Serve static files with lightweight Nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
