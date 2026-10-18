# Production Deployment Guide (VPS)

Comprehensive guide for deploying and operating the Supershop platform on a virtual private server (e.g., Vultr, DigitalOcean, Hetzner, AWS EC2) using Docker Compose and Nginx reverse proxy.

---

## 1. System Architecture

```
Internet (Ports 80 & 443)
           │
           ▼
┌────────────────────────────────────────────────────────┐
│             Nginx Reverse Proxy & SSL                  │
│       (Certbot TLS, Gzip, Media Cache, Rate Limit)     │
└──────┬──────────────────┬──────────────────┬───────────┘
       │                  │                  │
       ▼ /                ▼ /admin           ▼ /api/ & /media/
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│  Storefront  │   │  Admin SPA   │   │  Node.js API     │
│ Next.js SSR  │   │ Nginx Static │   │ Express Monolith │
│  (Port 3000) │   │  (Port 80)   │   │   (Port 4000)    │
└──────────────┘   └──────────────┘   └────────┬─────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
       ┌───────────────────────────────┐               ┌───────────────────────────────┐
       │       MongoDB 8.0             │               │       Redis 7.4-Alpine        │
       │ Single-Node Replica Set (rs0) │               │   AOF + Noeviction (BullMQ)   │
       │    (ACID Transactions)        │               │     (Caching & Queues)        │
       └───────────────────────────────┘               └───────────────────────────────┘
```

---

## 2. Server Specifications & Sizing

| Workload Level                  | vCPU    | RAM   | NVMe SSD | Recommended Provider            |
| :------------------------------ | :------ | :---- | :------- | :------------------------------ |
| **Minimum / Staging**           | 2 cores | 4 GB  | 40 GB    | Vultr Cloud Compute ($20/mo)    |
| **Production Standard**         | 4 cores | 8 GB  | 80 GB    | Vultr High Performance ($40/mo) |
| **High Traffic / Retail Scale** | 8 cores | 16 GB | 160 GB   | Vultr Dedicated / Bare Metal    |

**Operating System:** Ubuntu 22.04 LTS or 24.04 LTS (x86_64).

---

## 3. Pre-Deployment: DNS Configuration

Create DNS **A records** pointing to your server's public IPv4 address:

- `example.com` → `SERVER_IP`
- `admin.example.com` → `SERVER_IP`
- `api.example.com` → `SERVER_IP`

---

## 4. Step-by-Step Server Setup

### Step 1: Provision the Host

Log into the server via SSH as root and run the automated provisioning script:

```bash
# Clone the repository to /opt/supershop
git clone https://github.com/your-org/supershop.git /opt/supershop
cd /opt/supershop

# Run the host provisioning script (configures Docker, UFW firewall, fail2ban, logrotate, and backup cron)
sudo bash tools/deploy/vps-setup.sh
```

### Step 2: Configure Production Environment Variables

Copy `.env.production.example` and generate required cryptographic secrets:

```bash
cp .env.production.example .env.production
```

Generate 32-byte cryptographically secure keys:

```bash
# Generate MASTER_KEY (32-byte base64 string)
node -e "console.log('MASTER_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# Generate JWT_ACCESS_SECRET
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"

# Generate JWT_REFRESH_SECRET (must be distinct from access secret)
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('base64'))"
```

Edit `.env.production` and fill in:

- `API_PUBLIC_URL`, `STOREFRONT_URL`, `ADMIN_URL`
- `CORS_ORIGINS`
- `DOMAINS` and `SSL_EMAIL`
- The three generated secrets above.

### Step 3: Initialize SSL Certificates

```bash
# Generates bootstrap certificates so Nginx can start
bash tools/deploy/init-ssl.sh
```

Then request real certificates from Let's Encrypt:

```bash
docker compose -f docker-compose.prod.yml up -d nginx

docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d example.com -d admin.example.com -d api.example.com \
  --email admin@example.com \
  --agree-tos --no-eff-email

docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Step 4: Seed Database & Synchronize Indexes

```bash
# Seed initial roles and administrator account
docker compose -f docker-compose.prod.yml run --rm api npm run seed

# Synchronize database indexes across all collections
docker compose -f docker-compose.prod.yml run --rm api npm run db:indexes
```

### Step 5: Deploy the Application

Run the zero-downtime deployment script:

```bash
bash tools/deploy/deploy.sh
```

---

## 5. Operations & Maintenance

### Health Checks

- **API Liveness**: `curl -f http://localhost:4000/api/v1/health`
- **API Readiness (DB + Redis)**: `curl -f http://localhost:4000/api/v1/health/ready`
- **Storefront**: `curl -f http://localhost:3000/`

### Backups & Restores

- **Automated Backups**: Configured via `/etc/cron.d/supershop-backup` to run daily at 02:00 UTC.
- **Manual Backup**:
  ```bash
  npm run ops:backup
  ```
  Archives are stored in `var/backups/` alongside a SHA-256 verification manifest.
- **Manual Restore**:
  ```bash
  npm run ops:restore var/backups/backup_YYYYMMDD_HHMMSSZ.archive.gz -- --confirm
  ```

### Log Rotation

- Container logs use Docker's `json-file` driver with automatic 20MB limit and 5-file retention.
- Host logs are rotated daily by `/etc/logrotate.d/supershop` with 14-day retention.

---

## 6. Continuous Deployment (CI/CD)

The GitHub Actions workflow in `.github/workflows/deploy.yml` deploys automatically to your VPS on push to the `main` branch.

Set the following GitHub Repository Secrets:

- `VPS_HOST`: IP address or domain name of your server.
- `VPS_SSH_USER`: SSH username (e.g. `root` or dedicated deploy user).
- `VPS_SSH_KEY`: Private SSH key for server access.
