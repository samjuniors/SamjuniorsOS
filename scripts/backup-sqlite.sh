#!/bin/sh
set -e

# ============================================================================
# SamJuniorsOS — Automated SQLite & Data Backup Script (Option A)
# Invariant per G0.3: Daily automated backups with 30-day retention (RPO < 24h, RTO < 2h)
# ============================================================================

DB_DIR="${DB_DIR:-./db}"
DATA_DIR="${DATA_DIR:-./.data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_ARCHIVE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting SamJuniorsOS backup at ${TIMESTAMP}..."

# Safe SQLite snapshot using sqlite3 VACUUM INTO or safe copy if sqlite3 CLI exists
TEMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'backup')
trap 'rm -rf "${TEMP_DIR}"' EXIT

if [ -f "${DB_DIR}/custom.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_DIR}/custom.db" ".backup '${TEMP_DIR}/custom.db'"
  else
    cp "${DB_DIR}/custom.db" "${TEMP_DIR}/custom.db"
  fi
fi

if [ -d "${DATA_DIR}" ]; then
  mkdir -p "${TEMP_DIR}/.data"
  cp -r "${DATA_DIR}/." "${TEMP_DIR}/.data/" 2>/dev/null || true
fi

# Create compressed archive
tar -czf "${TARGET_ARCHIVE}" -C "${TEMP_DIR}" .

BACKUP_SIZE=$(ls -lh "${TARGET_ARCHIVE}" | awk '{print $5}')
echo "[backup] Backup created: ${TARGET_ARCHIVE} (${BACKUP_SIZE})"

# Enforce 30-day retention per G0.3
echo "[backup] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "backup_*.tar.gz" -type f -mtime +${RETENTION_DAYS} -exec rm -f {} \;

echo "[backup] Backup cycle completed successfully."
