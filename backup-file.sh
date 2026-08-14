#!/bin/bash
# Lokales Backup vor Code-Änderung; behält .bak* bis 6 Monate (183 Tage).
# Usage: ./backup-file.sh <datei> <thema>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
# 6 Monate ≈ 183 Tage (globale Regel, alle Projekte)
RETENTION_DAYS=183

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <file> <topic>" >&2
  exit 1
fi

SRC="$1"
THEMA="$2"

if [[ "$SRC" != /* ]]; then
  SRC="$REPO_ROOT/$SRC"
fi

if [[ ! -f "$SRC" ]]; then
  echo "File not found: $SRC" >&2
  exit 1
fi

DEST="${SRC}.bak.${THEMA}-$(date +%Y-%m-%d)"
cp -p "$SRC" "$DEST"
echo "Backup: $DEST"

DELETED=0
while IFS= read -r -d '' OLD; do
  rm -f "$OLD"
  echo "Removed old backup: $OLD"
  DELETED=$((DELETED + 1))
done < <(
  find "$REPO_ROOT" -type f -name '*.bak*' \
    ! -path '*/node_modules/*' \
    ! -path '*/.homeybuild/*' \
    ! -path '*/.git/*' \
    -mtime +"${RETENTION_DAYS}" \
    -print0 2>/dev/null
)

if [[ "$DELETED" -gt 0 ]]; then
  echo "Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days (~6 months)"
fi
