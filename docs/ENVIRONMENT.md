# Environment Variables

This document describes all environment variables used across the portal services.

## Default Behavior

**Local development works without any `.env` files** - sensible defaults are pre-configured.

You only need environment files for:

- Custom sentence chunking parameters
- Cloud Weaviate deployment
- Production settings

## Frontend Environment (`.env.local` / `.env.cloud`)

Located in project root.

### Weaviate Connection

```bash
# Local development (defaults; when connecting from host to Docker use port 8083)
WEAVIATE_HOST_URL=localhost
WEAVIATE_PORT=8083
WEAVIATE_GRPC_HOST_URL=localhost
WEAVIATE_GRPC_PORT=50054
WEAVIATE_SECURE=false

# Cloud deployment
WEAVIATE_HOST_URL=https://your-cluster.weaviate.network
WEAVIATE_ADMIN_KEY=your-weaviate-api-key
WEAVIATE_SECURE=true
```

### Optional Features

```bash
# Enable debug logging
DEBUG=true
```

## NLP Processor Environment (`nlp-processor/.env.local`)

Located in `nlp-processor/` directory.

### Weaviate Configuration

```bash
# Container hostname (use "weaviate" in Docker)
WEAVIATE_HOST_URL=weaviate

# Port (default: 8080)
WEAVIATE_PORT=8080

# Security
WEAVIATE_SECURE=false
```

### Chunking Configuration

```bash
# Number of sentences per chunk
SENTENCE_CHUNK_SIZE=10

# Number of repeated sentences between adjacent chunks
SENTENCE_OVERLAP=5

# Minimum words per chunk (merges smaller chunks)
MIN_WORDS_PER_CHUNK=10

# Minimum characters per chunk
MIN_CHARS_PER_CHUNK=50

# Maximum words per chunk (prevents oversized chunks)
MAX_WORDS_PER_CHUNK=200
```

### NER Configuration

```bash
# GLiNER model identifier
GLINER_MODEL=urchade/gliner_multi-v2.1

# Confidence threshold (0.0-1.0)
GLINER_THRESHOLD=0.3

# Minimum text length to run NER
MIN_TEXT_LENGTH_FOR_NER=50
```

### Embedding Configuration

```bash
# Sentence transformer model
EMBEDDING_MODEL=sentence-transformers/LaBSE

# Use GPU if available (requires CUDA)
USE_GPU=false
```

### NER Labels (from config.json)

The NLP processor reads NER labels from `/config.json`:

```json
{
  "ner": {
    "labels": [
      { "id": "person", "label": "Person" },
      { "id": "organization", "label": "Organization" },
      { "id": "location", "label": "Location" },
      { "id": "date", "label": "Date" },
      { "id": "event", "label": "Event" },
      { "id": "technology", "label": "Technology" }
    ]
  }
}
```

Override via environment:

```bash
NER_LABELS=person,organization,location,date
```

## Docker Compose Environment

Set in `docker-compose.yml` or override with `.env`:

```bash
# Watch file changes in Docker (for hot reload)
WATCHPACK_POLLING=true
CHOKIDAR_USEPOLLING=true
```

## Creating Environment Files

### Local Development (Optional)

Create `.env.local`:

```bash
# Minimal - when connecting from host to Docker (port 8083)
WEAVIATE_HOST_URL=localhost
WEAVIATE_PORT=8083
```

Create `nlp-processor/.env.local`:

```bash
# Minimal - only if you want different chunking
SENTENCE_CHUNK_SIZE=12
SENTENCE_OVERLAP=4
MAX_WORDS_PER_CHUNK=300
```

### Cloud Deployment (Required)

Create `.env.cloud`:

```bash
WEAVIATE_HOST_URL=https://your-cluster.weaviate.network
WEAVIATE_ADMIN_KEY=your-api-key
WEAVIATE_SECURE=true
```

Then run:

```bash
docker compose --profile cloud up
```

## Environment Priority

Variables are loaded in this order (later overrides earlier):

1. Default values in code
2. `.env.local` file
3. `.env.cloud` file (if using cloud profile)
4. System environment variables
5. Docker Compose `environment:` section

## Verifying Configuration

### Check NLP processor config:

```bash
curl http://localhost:7073/health | jq
```

Response:

```json
{
  "ok": true,
  "weaviate_url": "http://weaviate:8080",
  "beacon_host": "localhost",
  "gliner_model": "urchade/gliner_multi-v2.1",
  "embedding_model": "sentence-transformers/LaBSE",
  "embedding_dimension": 768,
  "use_gpu": false,
  "labels_count": 6
}
```

### Check frontend config:

```bash
docker compose exec frontend sh -c 'env | grep WEAVIATE'
```

## Common Configurations

### Fast Processing (Larger Chunks)

```bash
# nlp-processor/.env.local
SENTENCE_CHUNK_SIZE=14
SENTENCE_OVERLAP=3
MAX_WORDS_PER_CHUNK=300
```

### High Precision NER

```bash
# nlp-processor/.env.local
GLINER_THRESHOLD=0.5
MIN_TEXT_LENGTH_FOR_NER=100
```

### Minimal Chunking (More Granular)

```bash
# nlp-processor/.env.local
SENTENCE_CHUNK_SIZE=5
SENTENCE_OVERLAP=2
MIN_WORDS_PER_CHUNK=5
MAX_WORDS_PER_CHUNK=100
```

### GPU Acceleration

```bash
# nlp-processor/.env.local
USE_GPU=true
```

Requires:

- NVIDIA GPU
- Docker with GPU support
- CUDA-compatible Docker image

## Security Best Practices

**DO NOT commit to git:**

- `.env.local`
- `.env.cloud`
- Any file containing API keys

**Add to `.gitignore`:**

```gitignore
.env.local
.env.cloud
.env.production
nlp-processor/.env.local
```

**Use secrets management for production:**

- Docker Secrets
- Kubernetes Secrets
- HashiCorp Vault
- Cloud provider secret managers

## Troubleshooting

### Variables not being loaded

**Check Docker Compose config:**

```bash
docker compose config
```

**Restart services after changing env files:**

```bash
docker compose restart
```

### Wrong Weaviate connection

**Local:** Use `weaviate` (container hostname)
**Cloud:** Use full HTTPS URL

**Check logs:**

```bash
docker compose logs nlp-processor | grep WEAVIATE
```

### Environment conflicts

**Clear and rebuild:**

```bash
docker compose down
docker compose up --build
```

For more issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
