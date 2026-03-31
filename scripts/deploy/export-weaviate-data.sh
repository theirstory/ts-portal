#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   export only:
#     ./scripts/deploy/export-weaviate-data.sh
#   export + upload/sync to server:
#     ./scripts/deploy/export-weaviate-data.sh <backup_path> <volume_name> <user@server> <remote_repo_path>
# Example:
#     ./scripts/deploy/export-weaviate-data.sh "$PWD/weaviate-data.tar.gz" ts-portal_weaviate_data root@206.189.161.190 /root/ts-portal-uconn

backup_path="${1:-$PWD/weaviate-data.tar.gz}"
project_name="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
volume_name="${2:-${project_name}_weaviate_data}"
server="${3:-}"
remote_repo_path="${4:-/root/ts-portal-uconn}"

if [[ -n "$server" ]]; then
  if [[ "$server" == *"YOUR_SERVER_IP"* ]] || [[ "$server" == "user@"* ]]; then
    echo "Invalid server value: $server"
    echo "Change YOUR_SERVER_IP for your server IP address"
    exit 1
  fi

  if [[ "$remote_repo_path" == *"path/to/"* ]]; then
    echo "Invalid remote_repo_path: $remote_repo_path"
    echo "Use a real path like: /root/ts-portal-uconn"
    exit 1
  fi
fi

if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
  echo "Volume not found: $volume_name"
  echo "Check available volumes: docker volume ls | grep weaviate_data"
  exit 1
fi

docker compose down

docker run --rm \
  -v "$volume_name":/data \
  -v "$(dirname "$backup_path")":/backup \
  alpine tar czf "/backup/$(basename "$backup_path")" -C /data .

echo "Exported backup: $backup_path"

if [[ -n "$server" ]]; then
  for path in config.json json public; do
    if [[ ! -e "$path" ]]; then
      echo "Missing local path: $path"
      exit 1
    fi
  done

  # Reuse one authenticated SSH session for all remote operations.
  control_path="${HOME}/.ssh/cm-%C"
  ssh_opts=(-o ControlMaster=auto -o ControlPersist=10m -o ControlPath="$control_path")

  mkdir -p "${HOME}/.ssh"
  ssh "${ssh_opts[@]}" "$server" "mkdir -p '$remote_repo_path'"
  tar czf - config.json json public | ssh "${ssh_opts[@]}" "$server" "tar xzf - -C '$remote_repo_path'"
  scp "${ssh_opts[@]}" "$backup_path" "$server:/tmp/weaviate-data.tar.gz"

  echo "Synced config.json, json/, public/ and uploaded backup to $server"
  echo "Next on server:"
  echo "  cd $remote_repo_path"
  echo "  ./scripts/deploy/restore-weaviate-data.sh /tmp/weaviate-data.tar.gz"
  echo "  ./scripts/deploy/deploy-prod.sh"
fi
