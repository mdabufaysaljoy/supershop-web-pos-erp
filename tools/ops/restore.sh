#!/usr/bin/env bash
# ==============================================================================
# Database Restore Script for Supershop (P10.3)
# Restores MongoDB database from a compressed mongodump archive.
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

usage() {
  echo "Usage: $0 <archive-file> [--confirm]"
  echo ""
  echo "Options:"
  echo "  <archive-file>  Path to the .archive.gz file created by backup.sh"
  echo "  --confirm       Skip interactive confirmation prompt"
  echo ""
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

ARCHIVE_PATH="$1"
CONFIRM=false

for arg in "$@"; do
  if [ "$arg" = "--confirm" ]; then
    CONFIRM=true
  fi
done

if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Error: Archive file not found at ${ARCHIVE_PATH}" >&2
  exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "Error: mongorestore command not found in PATH." >&2
  exit 1
fi

if [ "${CONFIRM}" = false ]; then
  if [ -t 0 ]; then
    echo "======================================================================"
    echo "WARNING: This operation will drop and restore collections from:"
    echo "  ${ARCHIVE_PATH}"
    echo "Target: ${MONGO_URI}"
    echo "======================================================================"
    read -r -p "Type 'RESTORE' to proceed: " input
    if [ "${input}" != "RESTORE" ]; then
      echo "Aborted by user."
      exit 1
    fi
  else
    echo "Error: Non-interactive run requires --confirm flag to proceed." >&2
    exit 1
  fi
fi

echo "==> Restoring MongoDB database from ${ARCHIVE_PATH}..."
mongorestore --uri="${MONGO_URI}" --archive="${ARCHIVE_PATH}" --gzip --drop

echo "==> Restore completed successfully."
