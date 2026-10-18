#!/usr/bin/env bash
# ==============================================================================
# VPS Initial Server Provisioning Script for Supershop (P10.4)
# Configures Ubuntu 22.04 / 24.04 LTS: Docker, UFW firewall, fail2ban, logrotate, and backup cron.
# Run as root: sudo bash tools/deploy/vps-setup.sh
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

echo "======================================================================"
echo "==> Provisioning Supershop Production VPS Host"
echo "======================================================================"

export DEBIAN_FRONTEND=noninteractive

# Step 1: Base system updates & dependencies
echo "--> Step 1: Updating packages..."
apt-get update && apt-get upgrade -y
apt-get install -y --no-install-recommends \
    curl \
    git \
    ufw \
    fail2ban \
    ca-certificates \
    gnupg \
    logrotate \
    tar \
    gzip

# Step 2: Configure UFW Firewall
echo "--> Step 2: Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Let-s Encrypt'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Step 3: Install official Docker Engine & Docker Compose plugin
echo "--> Step 3: Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

# Step 4: Configure log rotation for application and backups
echo "--> Step 4: Configuring logrotate..."
cat << 'EOF' > /etc/logrotate.d/supershop
/var/log/supershop*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
}
EOF

# Step 5: Configure daily automated backup cron job at 02:00 UTC
echo "--> Step 5: Setting up automated backup cron job..."
CRON_FILE="/etc/cron.d/supershop-backup"
cat << 'EOF' > "${CRON_FILE}"
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
0 2 * * * root cd /opt/supershop && ./tools/ops/backup.sh >> /var/log/supershop-backup.log 2>&1
EOF
chmod 0644 "${CRON_FILE}"

# Step 6: Create application root directory
mkdir -p /opt/supershop
echo "--> Application deployment directory created at /opt/supershop"

echo "======================================================================"
echo "==> VPS Setup Complete!"
echo "    Next steps:"
echo "    1. Clone repo into /opt/supershop"
echo "    2. Copy .env.production.example to .env.production and configure secrets"
echo "    3. Run ./tools/deploy/init-ssl.sh"
echo "    4. Run ./tools/deploy/deploy.sh"
echo "======================================================================"
