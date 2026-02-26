#!/usr/bin/env bash
# Backup data and repo before deleting ts-portal-gmu on GitHub and re-forking.
# Run from repo root: ./scripts/backup-for-repo-recreate.sh

set -e
cd "$(git rev-parse --show-toplevel)"
BACKUP_DIR="ts-portal-gmu-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Backing up to $BACKUP_DIR ..."

# Data and config (gitignored but needed to restore)
for dir in public json; do
  if [[ -d "$dir" ]]; then
    cp -R "$dir" "$BACKUP_DIR/" && echo "  copied $dir/"
  fi
done
for f in config.json .env .env.local .env.cloud .env.production weaviate-data.tar.gz; do
  if [[ -f "$f" ]]; then
    cp "$f" "$BACKUP_DIR/" && echo "  copied $f"
  fi
done

# Full git history of current branch
BRANCH=$(git branch --show-current)
git bundle create "$BACKUP_DIR/repo-${BRANCH}.bundle" "$BRANCH" && echo "  created repo-${BRANCH}.bundle"

echo "Done. Backup is in $BACKUP_DIR"
echo "See RESTORE_AFTER_REFORK.md for next steps."
