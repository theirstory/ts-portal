# Command Reference

Complete reference of all Docker Compose and utility commands for the portal.

## Quick Reference

```bash
# Start
docker compose --profile local up

# Stop
docker compose down

# Logs
docker compose logs -f nlp-processor

# Reimport
docker compose run --rm weaviate-init

# Status
docker compose ps
```

## Container Management

### Starting Services

```bash
# Start all services (foreground with logs)
docker compose --profile local up

# Start in background (detached mode)
docker compose --profile local up -d

# Rebuild and start (after code changes)
docker compose --profile local up --build

# Start cloud mode (external Weaviate)
docker compose --profile cloud up

# Force recreate containers
docker compose up --force-recreate
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v

# Stop specific service
docker compose stop nlp-processor

# Stop and remove containers
docker compose rm -f
```

### Restarting Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart nlp-processor

# Restart with rebuild
docker compose down
docker compose up --build
```

## Viewing Logs

```bash
# Follow logs from all services
docker compose logs -f

# Follow logs from specific service
docker compose logs -f nlp-processor

# Last 100 lines
docker compose logs --tail=100 weaviate

# Since specific time
docker compose logs --since 2024-01-15T10:00:00

# Multiple services
docker compose logs -f nlp-processor weaviate

# No timestamps
docker compose logs --no-log-prefix
```

## Container Status

```bash
# List running containers
docker compose ps

# List all containers (including stopped)
docker compose ps -a

# Service health status
docker compose ps --services

# Container resource usage
docker stats

# Detailed container inspection
docker compose ps --format json | jq
```

## Executing Commands

```bash
# Enter shell in running container
docker compose exec frontend sh
docker compose exec nlp-processor bash

# Run command in running container
docker compose exec frontend yarn dev
docker compose exec nlp-processor python main.py

# Run command in new container (not running)
docker compose run --rm frontend yarn validate:config

# Run as root
docker compose exec -u root nlp-processor apt update
```

## Data Management

### Importing Interviews

```bash
# Full import (schema + data)
docker compose run --rm weaviate-init

# Schema generation only
docker compose run --rm weaviate-init yarn weaviate:generate-schemas

# Data import only
docker compose run --rm weaviate-init yarn weaviate:import

# Import with logs
docker compose logs -f weaviate-init
```

### Checking Data

```bash
# Count testimonies
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'

# Count chunks
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'

# View sample testimony
curl -s "http://localhost:8080/v1/objects?class=Testimonies&limit=1" | jq '.objects[0]'

# View sample chunk
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1" | jq '.objects[0]'

# Check chunk quality
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1000" | jq '{
  total: (.objects | length),
  ending_with_period: [.objects[].properties.transcription | select(endswith("."))] | length,
  avg_words: ([.objects[].properties.transcription | split(" ") | length] | add / length | floor),
  min_words: [.objects[].properties.transcription | split(" ") | length] | min,
  max_words: [.objects[].properties.transcription | split(" ") | length] | max
}'
```

### Clearing Data

```bash
# Remove Weaviate database only
docker volume rm portals_weaviate_data

# Remove all volumes (database + models)
docker compose down -v

# Remove models cache
docker volume rm portals_huggingface_cache

# Clear and restart
docker compose down
docker volume rm portals_weaviate_data
docker compose --profile local up
```

## Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect portals_weaviate_data
docker volume inspect portals_huggingface_cache

# Check volume size
docker system df -v

# Remove unused volumes
docker volume prune

# Backup volume
docker run --rm \
  -v portals_weaviate_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/weaviate-backup.tar.gz -C /data .

# Restore volume
docker run --rm \
  -v portals_weaviate_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/weaviate-backup.tar.gz -C /data
```

## Network Management

```bash
# List networks
docker network ls

# Inspect network
docker network inspect portals_default

# Check connectivity between containers
docker compose exec frontend ping weaviate
docker compose exec nlp-processor ping weaviate
```

## Testing & Validation

### Health Checks

```bash
# Weaviate
curl http://localhost:8080/v1/.well-known/ready

# NLP Processor
curl http://localhost:7070/health | jq

# Frontend
curl http://localhost:3000
```

### Testing NLP Features

```bash
# Test embeddings
curl -X POST http://localhost:7070/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a test sentence for embedding generation."}'

# Process single interview
curl -X POST http://localhost:7070/process-story \
  -H "Content-Type: application/json" \
  -d @json/interviews/example.json

# Custom chunking parameters
curl -X POST "http://localhost:7070/process-story?chunk_seconds=60&overlap_seconds=10" \
  -H "Content-Type: application/json" \
  -d @json/interviews/example.json
```

### Testing Search

```bash
# Semantic search via GraphQL
curl -X POST http://localhost:8080/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{
      Get {
        Chunks(
          nearText: {concepts: [\"technology innovation\"]},
          limit: 3
        ) {
          transcription
          start_time
          interview_title
          _additional {
            distance
          }
        }
      }
    }"
  }' | jq

# Search with filters
curl -X POST http://localhost:8080/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{
      Get {
        Chunks(
          nearText: {concepts: [\"education\"]},
          where: {
            path: [\"speaker\"],
            operator: Equal,
            valueText: \"John Doe\"
          },
          limit: 5
        ) {
          transcription
          speaker
          start_time
        }
      }
    }"
  }' | jq
```

### Schema Inspection

```bash
# View full schema
curl http://localhost:8080/v1/schema | jq

# View Testimonies class
curl http://localhost:8080/v1/schema/Testimonies | jq

# View Chunks class
curl http://localhost:8080/v1/schema/Chunks | jq

# Check vectorizer config
curl http://localhost:8080/v1/schema | jq '.classes[] | {name: .class, vectorizer: .vectorizer}'
```

## Debugging

### Container Debugging

```bash
# View container details
docker compose ps --format json | jq

# Inspect container
docker inspect <container_id>

# View container filesystem
docker compose exec frontend ls -la /app

# Check environment variables
docker compose exec nlp-processor env

# View running processes
docker compose exec nlp-processor ps aux
```

### Log Analysis

```bash
# Search logs for errors
docker compose logs nlp-processor | grep -i error

# Count log entries
docker compose logs nlp-processor | wc -l

# Export logs to file
docker compose logs nlp-processor > nlp-processor.log

# Follow logs from specific time
docker compose logs --since 1h -f
```

### Performance Monitoring

```bash
# Real-time stats
docker stats

# Container resource usage
docker compose top

# System disk usage
docker system df

# Detailed disk usage
docker system df -v
```

## Maintenance

### Updates

```bash
# Pull latest images
docker compose pull

# Rebuild containers
docker compose build --no-cache

# Update and restart
docker compose pull
docker compose up -d
```

### Cleanup

```bash
# Remove stopped containers
docker compose rm

# Remove unused images
docker image prune

# Remove unused volumes
docker volume prune

# Full system cleanup
docker system prune -a --volumes

# Cleanup specific service
docker compose rm -f nlp-processor
docker compose up -d nlp-processor
```

## Development Shortcuts

```bash
# Validate config
docker compose run --rm frontend yarn validate:config

# Generate TypeScript types from Weaviate
docker compose run --rm frontend yarn gen:weaviate-types

# Run linter
docker compose run --rm frontend yarn lint

# Format code
docker compose run --rm frontend yarn format

# Type check
docker compose run --rm frontend yarn type-check
```

## Production Deployment

```bash
# Build for production
docker compose build --no-cache

# Run production build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up

# Run with resource limits
docker compose up --scale nlp-processor=2

# Health check
docker compose ps | grep healthy
```

## Aliases (Optional Setup)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Portal aliases
alias portal-up='docker compose --profile local up'
alias portal-down='docker compose down'
alias portal-logs='docker compose logs -f'
alias portal-import='docker compose run --rm weaviate-init'
alias portal-status='docker compose ps'
alias portal-clean='docker compose down -v && docker volume rm portals_weaviate_data'
```

## Environment-Specific Commands

### Local Development

```bash
docker compose --profile local up
```

### Cloud Deployment

```bash
# Create .env.cloud first
docker compose --profile cloud up
```

### Switching Environments

```bash
# Stop local
docker compose --profile local down

# Start cloud
docker compose --profile cloud up
```

For more troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
