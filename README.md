# TheirStory Interview Archive Portal

Interview archive platform with vector semantic search and Named Entity Recognition (NER). Built with Weaviate, Next.js, and advanced NLP processing.

## ✨ What is it

A complete system to archive, process, and search video/audio interviews with their transcriptions. Enables intelligent semantic search, automatic entity extraction (people, organizations, places), and synchronized navigation with timestamps.

## 🚀 Features

- **Semantic Search**: Vector search with local embeddings (no external APIs)
- **Automatic NER**: Entity extraction with GLiNER (zero-shot, multilingual)
- **Hybrid Chunking**: Intelligent time-based + sentence boundary segmentation
- **Multi-format**: Video and audio with synchronized transcriptions
- **Live Highlighting**: Entities highlighted with clickable timestamps
- **Multi-organization**: Centralized configuration system
- **Docker**: Local deployment or cloud Weaviate connection

## 🛠️ Tech Stack

**Backend & NLP:**

- Weaviate (vector database)
- FastAPI (Python 3.11)
- GLiNER multi-v2.1 (NER)
- Sentence Transformers (embeddings 384-dim)

**Frontend:**

- Next.js + TypeScript
- Material UI
- Zustand (state)

**Requirements:**

- Docker & Docker Compose
- Node.js ≥18
- Yarn

## 🚀 Quick Start

```bash
# 1. Clone and configure
git clone git@github.com:theirstory/portals.git
cd portals

cp config.example.json config.json
# Edit config.json with your organization details

cp .env.example .env.local
cp nlp-processor/.env.example nlp-processor/.env

# 2. Start services
docker compose --profile local up

# 3. Open in browser
open http://localhost:3000
```

**Important:** Edit `config.json` to customize your portal with organization name, branding colors, logos, and NER entity labels. See [CONFIGURATION.md](./CONFIGURATION.md) for all configuration options.

**First time:** ~2 minutes (downloads models ~400MB). Subsequent: ~30 seconds.

## NLP Environment Notes

Default embedding model is `sentence-transformers/LaBSE` (multilingual). If model loading fails or is too heavy, use `sentence-transformers/all-MiniLM-L6-v2` as a lighter fallback.

**Services:**

- Frontend: `localhost:3000`
- Weaviate: `localhost:8080`
- NLP Processor: `localhost:7070`

## 📥 Import Interviews

### Getting Interview JSONs from TheirStory

If you have interviews already uploaded to TheirStory, you can easily obtain the JSON files:

1. Navigate to https://lab.theirstory.io/ts-api-core-demo/v022/
2. Log in with your TheirStory username and password
3. Download the JSON files for your interviews

### Importing the Data

```bash
# 1. Add your collection subfolders and interview JSON files under:
json/interviews/

# 2. Manual import
docker compose run --rm weaviate-init
```

Recommended approach: create one subfolder per collection and place interview JSON files inside each folder.

If you place JSON files directly under `json/interviews/` (without subfolder), they are imported into the `default` collection.

Example:

```text
json/interviews/
├── oral-history/
│   ├── collection.json
│   └── interview-1.json
└── veterans/
    ├── collection.json
    └── interview-2.json
```

See `json/interviews/README.md` and `docs/IMPORTING_INTERVIEWS.md` for full details.

**Process:**

1. Hybrid chunking (~30s + sentence boundaries)
2. Embedding generation
3. NER extraction (people, places, organizations, etc.)
4. Storage in Weaviate with vectors

**Verify:**

```bash
# Count interviews and chunks
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'
```

**JSON Format:** See [docs/IMPORTING_INTERVIEWS.md](./docs/IMPORTING_INTERVIEWS.md)

## 🚢 Production Deployment

This production flow works on any Linux host with Docker.

Before running deployment commands:

- Create a Linux server in your hosting provider (DigitalOcean, AWS, Hetzner, etc.).
- Connect to that server via SSH (example: `ssh root@YOUR_SERVER_IP`).

On the server terminal (remote host):

```bash
# Install git and clone repo (one time)
sudo apt update && sudo apt install -y git
git clone git@github.com:theirstory/ts-portal.git
cd ts-portal

# Install Docker once (Ubuntu)
sudo bash scripts/deploy/setup-docker-ubuntu.sh

# Deploy/update
./scripts/deploy/deploy-prod.sh

# Site URL after deploy
# http://YOUR_SERVER_IP:3000

# Optional but recommended: domain + HTTPS + firewall
# sudo bash scripts/deploy/setup-nginx-ssl.sh YOUR_DOMAIN YOUR_EMAIL 3000
```

First production build can take **15-20 minutes** on small servers.

If you already have indexed data locally and want to avoid re-import/NLP processing in production (recommended):

On your local terminal:

```bash
# One command: export backup + sync config/json/public + upload backup
./scripts/deploy/export-weaviate-data.sh "$PWD/weaviate-data.tar.gz" ts-portal_weaviate_data root@YOUR_SERVER_IP /root/ts-portal
```

On the server terminal:

```bash
cd /root/ts-portal
./scripts/deploy/restore-weaviate-data.sh /tmp/weaviate-data.tar.gz
./scripts/deploy/deploy-prod.sh
```

Note: with server parameters, `export-weaviate-data.sh` also syncs `config.json`, `json/`, and `public/`.

Full guide (DigitalOcean example): **[docs/DEPLOY_PRODUCTION.md](./docs/DEPLOY_PRODUCTION.md)**

## 📚 Documentation

- **[CONFIGURATION.md](./CONFIGURATION.md)** - Portal configuration, colors, NER labels
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and CLA signing via CLA Assistant
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Container architecture and services
- **[docs/IMPORTING_INTERVIEWS.md](./docs/IMPORTING_INTERVIEWS.md)** - JSON format and import process
- **[docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md)** - Environment variables and advanced configuration
- **[docs/COMMANDS.md](./docs/COMMANDS.md)** - All available commands
- **[docs/DEPLOY_PRODUCTION.md](./docs/DEPLOY_PRODUCTION.md)** - Production deployment guide (works on any Docker host, with DigitalOcean example)
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

## ⚡ Common Commands

```bash
# Start/stop
docker compose --profile local up     # Start with logs
docker compose down                   # Stop

# Production (with Docker)
./scripts/deploy/deploy-prod.sh
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f

# Logs & debugging
docker compose logs -f nlp-processor  # Follow logs
docker compose ps                     # Service status

# Data
docker compose run --rm weaviate-init # Reimport interviews
docker volume rm portals_weaviate_data # Clear DB

# Verify data
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'

# Testing NLP
curl -X POST http://localhost:7070/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Test sentence"}'

# Health checks
curl http://localhost:8080/v1/.well-known/ready  # Weaviate
curl http://localhost:7070/health | jq          # NLP Processor
```

See [docs/COMMANDS.md](./docs/COMMANDS.md) for the complete list.

## 📁 Project Structure

```
portals/
├── app/                    # Next.js application
│   ├── story/[storyUuid]/  # Interview detail pages
│   ├── stores/             # Zustand state management
│   └── utils/              # Helper functions
├── components/             # React components
├── config/                 # Organization configuration
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md
│   ├── COMMANDS.md
│   ├── DEPLOY_PRODUCTION.md
│   ├── ENVIRONMENT.md
│   ├── IMPORTING_INTERVIEWS.md
│   └── TROUBLESHOOTING.md
├── json/interviews/        # Interview JSON files (auto-import)
├── lib/                    # Libraries (Weaviate, theme)
├── nlp-processor/          # Python NLP service
│   ├── main.py             # FastAPI application
│   ├── chunker.py          # Hybrid chunking algorithm
│   ├── ner_processor.py    # GLiNER NER extraction
│   └── weaviate_client.py  # Weaviate batch operations
├── scripts/                # Import and schema scripts
├── types/                  # TypeScript type definitions
├── config.json             # Portal configuration
├── CONFIGURATION.md        # Config documentation
└── docker-compose.yml      # Container orchestration
```

## 🙏 Credits

Built with:

- [Weaviate](https://weaviate.io/) - Vector database
- [GLiNER](https://github.com/urchade/GLiNER) - Named Entity Recognition
- [Sentence Transformers](https://www.sbert.net/) - Embeddings
- [Next.js](https://nextjs.org/) - React framework
- [Material UI](https://mui.com/) - Component library

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
