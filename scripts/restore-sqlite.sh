#!/bin/sh
set -e

# ============================================================================
# SamJuniorsOS — SQLite & Data Restore Script (Option A)
# Invariant per G0.3: RPO < 24h, RTO < 2h disaster recovery drill
# ============================================================================

BACKUP_ARCHIVE="${1}"
DB_DIR="${DB_DIR:-./db}"
DATA_DIR="${DATA_DIR:-./.data}"

if [ -z "${BACKUP_ARCHIVE}" ]; then
  # If no archive specified, default to the latest archive in ./backups
  BACKUP_ARCHIVE=$(ls -t ./backups/backup_*.tar.gz 2>/dev/null | head -n 1)
  if [ -z "${BACKUP_ARCHIVE}" ]; then
    echo "Usage: $0 <path-to-backup-archive.tar.gz>"
    exit 1
  fi
  echo "[restore] No archive specified. Using latest backup: ${BACKUP_ARCHIVE}"
fi

if [ ! -f "${BACKUP_ARCHIVE}" ]; then
  echo "Error: Backup archive not found: ${BACKUP_ARCHIVE}"
  exit 1
fi

echo "[restore] Starting restore from ${BACKUP_ARCHIVE}..."
START_TIME=$(date +%s)

TEMP_RESTORE_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'restore')
trap 'rm -rf "${TEMP_RESTORE_DIR}"' EXIT

tar -xzf "${BACKUP_ARCHIVE}" -C "${TEMP_RESTORE_DIR}"

mkdir -p "${DB_DIR}"
mkdir -p "${DATA_DIR}"

if [ -f "${TEMP_RESTORE_DIR}/custom.db" ]; then
  cp "${TEMP_RESTORE_DIR}/custom.db" "${DB_DIR}/custom.db"
  echo "[restore] SQLite database restored to ${DB_DIR}/custom.db"
fi

if [ -d "${TEMP_RESTORE_DIR}/.data" ]; then
  cp -r "${TEMP_RESTORE_DIR}/.data/." "${DATA_DIR}/"
  echo "[restore] File stores restored to ${DATA_DIR}/"
fi

# Run SQLite integrity check if sqlite3 is installed
if command -v sqlite3 >/dev/null 2>&1 && [ -f "${DB_DIR}/custom.db" ]; then
  INTEGRITY=$(sqlite3 "${DB_DIR}/custom.db" "PRAGMA integrity_check;")
  if [ "${INTEGRITY}" != "ok" ]; then
    echo "[restore] FAILED: SQLite integrity check failed: ${INTEGRITY}"
    exit 1
  fi
  echo "[restore] SQLite integrity check passed: ${INTEGRITY}"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
echo "[restore] Restore completed successfully in ${DURATION}s (RTO target: < 7200s / 2h)."
