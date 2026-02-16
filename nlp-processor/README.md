# nlp-processor

FastAPI service that chunks transcript words and optionally runs NER (GLiNER via spaCy),
then optionally writes Testimonies + Chunks to Weaviate.

## Requirements

- Python 3.10+ (recommended 3.11)
- Docker (for Weaviate)

## Environment

Create your env file:

```bash
cp .env.example .env
```

`docker-compose.yml` loads `nlp-processor/.env` for the `nlp-processor` service.
If a variable is missing in `.env`, the service falls back to `config.py` defaults.

### Embedding model options

Default (multilingual):

```env
EMBEDDING_MODEL=sentence-transformers/LaBSE
```

Alternatives:

```env
# Lighter and faster fallback if LaBSE fails
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Higher quality multilingual, heavier
EMBEDDING_MODEL=BAAI/bge-m3
```

Optional timeout for model load:

```env
EMBEDDING_LOAD_TIMEOUT_SECONDS=180
```

## 1) Run Weaviate in Docker (local)

```bash
docker run -d --name weaviate \
  -p 8080:8080 \
  -p 50051:50051 \
  -e AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true \
  -e PERSISTENCE_DATA_PATH="/var/lib/weaviate" \
  -e QUERY_DEFAULTS_LIMIT=25 \
  -e DEFAULT_VECTORIZER_MODULE=none \
  -e CLUSTER_HOSTNAME=node1 \
  semitechnologies/weaviate:latest
```
