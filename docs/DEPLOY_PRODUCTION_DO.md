# Production Deployment on DigitalOcean Droplet

This guide deploys the stack in production mode using Docker on a single DigitalOcean Droplet.
By default, production starts only `weaviate` + `frontend` (no NLP model loading).

## 0) Prerequisites

- A DigitalOcean Droplet with Ubuntu 24.04
- A domain pointing to the Droplet IP (optional, but recommended)
- SSH access to the server

Recommended droplet size: **4 vCPU / 8GB RAM**.

## 1) Install Docker (one time)

Run on the Droplet:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
```

## 2) Clone and configure project

```bash
git clone <YOUR_REPO_URL> ts-portal
cd ts-portal

cp config.example.json config.json
cp .env.production.example .env.production
cp nlp-processor/.env.example nlp-processor/.env
```

Edit these files:

- `config.json`
- `.env.production`
- `nlp-processor/.env`

For this deployment mode, keep `.env.production` with internal Docker host names (`weaviate`).

## 3) Start production stack (light mode)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
```

Read logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 4) Verify services

- Frontend: `http://YOUR_DROPLET_IP:3000`
- Weaviate ready:

```bash
curl http://localhost:8080/v1/.well-known/ready
```

## 5) Migrate existing local Weaviate data to production (no re-import)

If you already have all data indexed locally, move the Weaviate volume to production and skip `weaviate-init`.

### 5.1 Export local volume (on your local machine)

```bash
# Make sure local stack is stopped first
docker compose down

# Create a tar.gz backup of local Weaviate data
docker run --rm \
  -v ts-portal_weaviate_data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/weaviate-data.tar.gz -C /data .
```

If your local compose project name is different, check the exact volume name:

```bash
docker volume ls | grep weaviate_data
```

### 5.2 Copy backup to Droplet

```bash
scp weaviate-data.tar.gz root@YOUR_DROPLET_IP:/root/
```

### 5.3 Restore into production volume (on Droplet)

```bash
cd ts-portal

# Stop services first
docker compose -f docker-compose.prod.yml down

# Ensure volume exists
docker volume create ts-portal_weaviate_data

# Restore backup into volume
docker run --rm \
  -v ts-portal_weaviate_data:/data \
  -v /root:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/weaviate-data.tar.gz -C /data"

# Start production services
docker compose -f docker-compose.prod.yml up -d --build
```

### 5.4 Validate data on Droplet

```bash
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'
```

## 6) Basic operations

Update to latest code:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Restart services:

```bash
docker compose -f docker-compose.prod.yml restart
```

Stop services:

```bash
docker compose -f docker-compose.prod.yml down
```

## 7) Optional: run import in production only when needed

This starts NLP + import jobs only for that run:

```bash
docker compose -f docker-compose.prod.yml --profile init run --rm weaviate-init
```

## 8) Optional: expose with HTTPS (recommended)

Use Nginx/Caddy as reverse proxy to forward:

- `https://your-domain.com` -> `http://127.0.0.1:3000`

After proxy is configured, close public access to port `3000` in your firewall.

## Troubleshooting

- If `weaviate-init` fails, inspect logs:

```bash
docker compose -f docker-compose.prod.yml --profile init logs weaviate-init
```

- If model download is slow while running import: this is expected. NLP downloads models once and caches them in `huggingface_cache` volume.

- To re-run import manually:

```bash
docker compose -f docker-compose.prod.yml --profile init run --rm weaviate-init
```
