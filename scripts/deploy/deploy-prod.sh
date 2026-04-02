#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f config.json ]]; then
  cp config.example.json config.json
  echo "Created config.json from template. Edit it before public launch."
fi

if [[ ! -f .env.production ]]; then
  cp .env.production.example .env.production
  echo "Created .env.production from template."
  echo "If you use Discover chat, edit .env.production and add the provider API key before re-running deploy."
fi
[[ -f nlp-processor/.env ]] || cp nlp-processor/.env.example nlp-processor/.env

mkdir -p .yarn

echo "Loading production environment from .env.production via docker-compose.prod.yml"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
