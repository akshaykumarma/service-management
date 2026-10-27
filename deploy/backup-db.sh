#!/bin/sh
# Nightly database backup: a compressed dump in ~/backups, keeping the last 14 days.
# Install with:  crontab -e   and add:
#   30 2 * * * /home/ubuntu/service-management/deploy/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y-%m-%d_%H%M)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U service_management service_management \
  | gzip > "$BACKUP_DIR/service_management_$STAMP.sql.gz"
find "$BACKUP_DIR" -name 'service_management_*.sql.gz' -mtime +14 -delete
echo "$(date) backup written: $BACKUP_DIR/service_management_$STAMP.sql.gz"
