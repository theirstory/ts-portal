# Container Architecture

This document describes the Docker container architecture and how services interact.

## Container Overview

### Local Profile (`--profile local`)

| Container         | Purpose                        | Port        | Image/Base                       | Volumes                                       |
| ----------------- | ------------------------------ | ----------- | -------------------------------- | --------------------------------------------- |
| **weaviate**      | Vector database                | 8080, 50051 | semitechnologies/weaviate:1.35.0 | `weaviate_data`                               |
| **nlp-processor** | NLP service (embeddings + NER) | 7070        | python:3.11-slim                 | `./nlp-processor:/app`<br>`huggingface_cache` |
| **weaviate-init** | Schema + data import           | -           | node:20                          | `.:/app`<br>`node_modules`                    |
| **frontend**      | Next.js web application        | 3000        | node:20                          | `.:/app`<br>`node_modules`<br>`yarn_cache`    |

### Cloud Profile (`--profile cloud`)

| Container          | Purpose         | Port | Notes                                 |
| ------------------ | --------------- | ---- | ------------------------------------- |
| **frontend_cloud** | Next.js web app | 3000 | Connects to external Weaviate cluster |

## Container Details

### `weaviate` (Local Only)

**Purpose**: Vector database for storing embeddings, metadata, and relationships.

**Configuration:**

- Anonymous access enabled (development only)
- Custom vectorizer disabled (uses external embeddings from nlp-processor)
- Persistence via `weaviate_data` volume

**Healthcheck**:

```bash
curl http://localhost:8080/v1/.well-known/ready
```

**When to use**: Local development, testing, demos  
**When NOT to use**: Production (use managed Weaviate Cloud instead)

---

### `nlp-processor`

**Purpose**: FastAPI service that processes interviews with NLP capabilities.

**Responsibilities:**

- **Hybrid Chunking**: Splits transcripts into ~30s segments with sentence boundary detection
- **Embeddings**: Generates 384-dim vectors using sentence-transformers
- **NER**: Extracts named entities using GLiNER (people, organizations, locations, etc.)
- **Batch Processing**: Efficient insertion of chunks into Weaviate

**Key Technologies:**

- FastAPI (Python 3.11)
- GLiNER multi-v2.1 (zero-shot NER)
- sentence-transformers/LaBSE
- Weaviate Python client

**Volumes:**

- `./nlp-processor:/app` - Live code reloading for development
- `./config.json:/config.json:ro` - Read-only access to portal config
- `huggingface_cache:/root/.cache/huggingface` - Persistent model cache (~400MB)

**Startup Time:**

- First run: ~60-90s (downloads models)
- Subsequent runs: ~10-15s (uses cached models)

**Healthcheck:**

```bash
curl http://localhost:7070/health
```

**Environment Variables**: See [ENVIRONMENT.md](./ENVIRONMENT.md)

---

### `weaviate-init`

**Purpose**: One-time initialization container that sets up schema and imports data.

**Execution Flow:**

1. Waits for `weaviate` and `nlp-processor` to be healthy
2. Runs `yarn weaviate:generate-schemas` - Creates Weaviate classes
3. Runs `yarn weaviate:import` - Processes and imports interviews
4. Exits with code 0 on success

**When it runs:**

- Automatically on `docker compose up`
- Manually via `docker compose run --rm weaviate-init`

**Restart Policy**: `no` (runs once then stops)

**Scripts:**

- `scripts/init-schema.ts` - Schema generator
- `scripts/import-interviews-weaviate.ts` - Import orchestrator

---

### `frontend`

**Purpose**: Next.js web application with hot reloading for development.

**Features:**

- Server-side rendering
- Hot module replacement
- TypeScript compilation
- Material UI theming
- Zustand state management

**Volumes:**

- `.:/app` - Full project mount for live reloading
- `node_modules:/app/node_modules` - Cached dependencies
- `yarn_cache:/yarn-cache` - Yarn package cache
- `./config.json:/app/config.json:ro` - Portal configuration

**Environment:**

- `WATCHPACK_POLLING=true` - File watching in Docker
- `WEAVIATE_HOST_URL` - Weaviate connection

**Dependencies**:

- Waits for `weaviate`, `nlp-processor`, and `weaviate-init` to complete

---

## Docker Volumes

```yaml
volumes:
  weaviate_data: # Weaviate database (local mode)
  node_modules: # Node.js dependencies (shared)
  yarn_cache: # Yarn package cache (shared)
  huggingface_cache: # ML models (~400MB, persistent)
```

### Volume Management

```bash
# List all volumes
docker volume ls

# Inspect a volume
docker volume inspect portals_huggingface_cache

# Remove all volumes (WARNING: deletes all data)
docker compose down -v

# Remove only database (keeps models cached)
docker volume rm portals_weaviate_data

# Check volume size
docker system df -v
```

## Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Network                       │
│                                                          │
│  ┌──────────────┐      ┌──────────────┐               │
│  │   frontend   │─────▶│   weaviate   │               │
│  │  (Next.js)   │      │  (port 8080) │               │
│  │  port 3000   │      └──────────────┘               │
│  └──────────────┘             ▲                         │
│         │                     │                         │
│         │                     │                         │
│         ▼                     │                         │
│  ┌──────────────┐      ┌──────────────┐               │
│  │weaviate-init │─────▶│nlp-processor │               │
│  │   (runner)   │      │ (port 7070)  │               │
│  └──────────────┘      └──────────────┘               │
│                                                          │
└─────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   Host: 3000            Host: 7070, 8080
```

**Flow:**

1. User accesses frontend on `localhost:3000`
2. Frontend queries Weaviate on `weaviate:8080` (internal) / `localhost:8080` (external)
3. Import process sends interviews to `nlp-processor:7070`
4. NLP processor writes chunks with vectors to `weaviate:8080`

## Development vs Production

### Development (Local Profile)

**Characteristics:**

- All services run locally
- Hot reloading enabled
- Anonymous Weaviate access
- Local file mounts for live updates
- Debug logging enabled

**Best for:**

- Feature development
- Testing NLP changes
- Quick iterations
- Debugging

### Production (Cloud Profile)

**Characteristics:**

- Frontend only runs locally
- Connects to external Weaviate cluster
- Requires authentication
- No local Weaviate or NLP processor
- Optimized builds

**Best for:**

- Production deployments
- Using managed Weaviate Cloud
- Scaling independently

## Health Checks

All services include health checks to ensure proper startup sequencing:

```bash
# Check all services
docker compose ps

# Individual health checks
curl http://localhost:8080/v1/.well-known/ready  # Weaviate
curl http://localhost:7070/health               # NLP Processor
curl http://localhost:3000                      # Frontend
```

## Resource Requirements

**Minimum:**

- CPU: 2 cores
- RAM: 4GB
- Disk: 5GB (with models cached)

**Recommended:**

- CPU: 4 cores
- RAM: 8GB
- Disk: 10GB

**Model Cache:**

- GLiNER: ~200MB
- Sentence Transformers: ~150MB
- Total: ~400MB (downloaded once, cached)

## Troubleshooting

For common issues and solutions, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
