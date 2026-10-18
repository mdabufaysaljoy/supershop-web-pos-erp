#!/usr/bin/env bash
# ==============================================================================
# Database Backup Script for Supershop (P10.3)
# Dumps MongoDB database to a compressed archive and triggers Redis BGSAVE.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load .env if present
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ROOT_DIR}/.env" | sed 's/\r$//')
  set +a
fi

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/supershop?directConnection=true}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/var/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Ensure output directory exists
mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_NAME="backup_${TIMESTAMP}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.archive.gz"
MANIFEST_FILE="${BACKUP_DIR}/${BACKUP_NAME}.manifest.json"

echo "==> Starting database backup at ${TIMESTAMP}..."

# Check dependencies
if ! command -v mongodump >/dev/null 2>&1; then
  echo "Error: mongodump command not found in PATH." >&2
  exit 1
fi

# Run mongodump
echo "--> Dumping MongoDB to ${BACKUP_FILE}..."
mongodump --uri="${MONGO_URI}" --archive="${BACKUP_FILE}" --gzip

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file was not created." >&2
  exit 1
fi

# Trigger Redis BGSAVE if redis-cli is present and reachable
REDIS_SAVED=false
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -u "${REDIS_URL}" ping >/dev/null 2>&1; then
    echo "--> Triggering Redis BGSAVE..."
    redis-cli -u "${REDIS_URL}" bgsave >/dev/null 2>&1 || true
    REDIS_SAVED=true
  fi
fi

# Compute SHA-256 and size
if command -v shasum >/dev/null 2>&1; then
  CHECKSUM="$(shasum -a 256 "${BACKUP_FILE}" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM="$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')"
else
  CHECKSUM="unknown"
fi

FILE_SIZE="$(wc -c < "${BACKUP_FILE}" | tr -d ' ')"

# Write manifest
cat <<EOF > "${MANIFEST_FILE}"
{
  "timestamp": "${TIMESTAMP}",
  "file": "$(basename "${BACKUP_FILE}")",
  "sizeBytes": ${FILE_SIZE},
  "sha256": "${CHECKSUM}",
  "redisBgSave": ${REDIS_SAVED},
  "status": "success"
}
EOF

echo "--> Backup created successfully:"
echo "    Archive:  ${BACKUP_FILE} (${FILE_SIZE} bytes)"
echo "    Checksum: ${CHECKSUM}"
echo "    Manifest: ${MANIFEST_FILE}"

# Prune backups older than retention days
if [ "${RETENTION_DAYS}" -gt 0 ]; then
  echo "--> Pruning backups older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -name "backup_*.archive.gz" -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true
  find "${BACKUP_DIR}" -name "backup_*.manifest.json" -mtime +"${RETENTION_DAYS}" -delete 2>/dev/null || true
fi

echo "==> Backup complete."
