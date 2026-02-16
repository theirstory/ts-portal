# Troubleshooting Guide

Common issues and solutions for the Interview Archive Portal.

## Quick Diagnostics

```bash
# Check all services status
docker compose ps

# View logs for errors
docker compose logs --tail=50 | grep -i error

# Health check all services
curl http://localhost:8080/v1/.well-known/ready  # Weaviate
curl http://localhost:7070/health                # NLP
curl http://localhost:3000                       # Frontend
```

## Startup Issues

### Models Not Downloading

**Symptoms:**

- NLP processor shows "Downloading models..."
- Timeout or connection errors
- Service never becomes healthy

**Solutions:**

```bash
# Check internet connection
ping huggingface.co

# Restart service
docker compose restart nlp-processor

# View detailed logs
docker compose logs -f nlp-processor

# Check disk space (models need ~400MB)
docker system df

# Manual model download (if persistent issues)
docker compose exec nlp-processor bash
pip install -U sentence-transformers
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
```

**Prevention:**

- First run takes 1-2 minutes - be patient
- Models are cached in `huggingface_cache` volume
- Ensure stable internet connection

---

### Port Already in Use

**Symptoms:**

```
Error: bind: address already in use
```

**Solutions:**

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
lsof -ti:3000 | xargs kill -9

# Or change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead

# Check all port conflicts
lsof -ti:3000,7070,8080
```

---

### Weaviate Connection Refused

**Symptoms:**

- `connection refused` errors
- Frontend can't connect to Weaviate
- Import fails immediately

**Solutions:**

```bash
# Wait for Weaviate to be fully healthy
docker compose ps
# Look for "healthy" status

# Check Weaviate is responding
curl http://localhost:8080/v1/.well-known/ready

# If unhealthy, check logs
docker compose logs weaviate

# Restart if needed
docker compose restart weaviate

# Give it time - can take 30-60s on first start
watch -n 2 'curl -s http://localhost:8080/v1/.well-known/ready'
```

---

### Container Exits Immediately

**Symptoms:**

- Container shows "Exited (1)" or "Exited (137)"
- Services keep restarting

**Solutions:**

```bash
# Check exit code and logs
docker compose ps -a
docker compose logs <container_name>

# Exit 137 = Out of memory
# Solution: Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory → 8GB+

# Exit 1 = Error in startup
# Check logs for specific error

# Force recreate
docker compose down
docker compose up --force-recreate
```

---

## Import Issues

### Chunks Not Being Created

**Symptoms:**

- Testimonies imported but Chunks = 0
- Import succeeds but no searchable content

**Diagnostics:**

```bash
# Check NLP processor logs
docker compose logs nlp-processor | grep -i chunk

# Verify interview JSON structure
cat json/interviews/problem.json | jq '.transcript.sections[0].paragraphs[0].words | length'

# Test processing directly
curl -X POST http://localhost:7070/process-story \
  -H "Content-Type: application/json" \
  -d @json/interviews/problem.json
```

**Common Causes:**

1. **Missing word timestamps:**

```json
// BAD - no start/end times
{"text": "hello"}

// GOOD
{"text": "hello", "start": 0.5, "end": 1.2}
```

2. **Empty paragraphs:**

```bash
# Check for empty word arrays
cat json/interviews/problem.json | jq '.transcript.sections[].paragraphs[].words | length'
```

3. **NLP processor not healthy:**

```bash
curl http://localhost:7070/health
```

**Solutions:**

```bash
# Restart NLP processor
docker compose restart nlp-processor

# Reimport with logging
docker compose run --rm weaviate-init 2>&1 | tee import.log
```

---

### Import Fails with "Story ID Missing"

**Cause:** JSON missing required `story._id` field

**Solution:**

```bash
# Validate JSON
cat json/interviews/problem.json | jq '.story._id'

# Should return a string, not null

# Fix by adding ID
cat json/interviews/problem.json | \
  jq '.story._id = "generated-id-123"' > fixed.json
```

---

### Slow Import Performance

**Symptoms:**

- Import takes hours for small datasets
- CPU at 100% constantly
- Memory usage grows over time

**Solutions:**

```bash
# Check resource usage
docker stats

# Reduce NER processing
# Edit nlp-processor/.env.local:
GLINER_THRESHOLD=0.5  # Higher = fewer entities = faster
MIN_TEXT_LENGTH_FOR_NER=100  # Skip short texts

# Increase chunk size (fewer chunks)
CHUNK_SECONDS=60
MAX_WORDS_PER_CHUNK=300

# Process in smaller batches
# Move most JSONs out temporarily
mv json/interviews/*.json /tmp/batch/
mv /tmp/batch/interview-001.json json/interviews/
docker compose run --rm weaviate-init
```

---

## Runtime Issues

### Frontend Not Loading

**Symptoms:**

- Browser shows connection error
- Blank page
- 502 Bad Gateway

**Solutions:**

```bash
# Check frontend is running
docker compose ps frontend

# View logs
docker compose logs -f frontend

# Check for port conflicts
lsof -ti:3000

# Restart
docker compose restart frontend

# Full rebuild
docker compose down
docker compose up --build frontend
```

---

### Search Not Working

**Symptoms:**

- No results for any query
- "No interviews found"
- Errors in console

**Diagnostics:**

```bash
# Verify data exists
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'

# Test direct search
curl -X POST http://localhost:8080/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{Get {Chunks(limit: 1) {transcription}}}"}' | jq

# Check vectors exist
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1" | \
  jq '.objects[0].vector | length'
```

**Solutions:**

```bash
# Reimport with vectors
docker compose run --rm weaviate-init

# Verify NLP processor is healthy
curl http://localhost:7070/health

# Check embedding generation
curl -X POST http://localhost:7070/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "test"}'
```

---

### NER Entities Not Showing

**Symptoms:**

- Transcripts display but no highlighted entities
- `ner_labels` array is empty

**Diagnostics:**

```bash
# Check NER was enabled during import
docker compose logs weaviate-init | grep ner

# Verify entities in database
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1" | \
  jq '.objects[0].properties.ner_data'

# Check NER threshold
curl http://localhost:7070/health | jq '.gliner_threshold'
```

**Solutions:**

```bash
# Lower NER threshold for more entities
# Edit nlp-processor/.env.local:
GLINER_THRESHOLD=0.2

# Verify labels in config.json
cat config.json | jq '.ner.labels'

# Reimport
docker compose restart nlp-processor
docker compose run --rm weaviate-init
```

---

## Performance Issues

### High Memory Usage

**Symptoms:**

- Docker using 8GB+ RAM
- System becomes slow
- Containers being killed (OOM)

**Solutions:**

```bash
# Check usage
docker stats

# Restart heavy services
docker compose restart nlp-processor

# Clear unused resources
docker system prune -a

# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory

# Reduce batch size
# Process fewer interviews at once

# Disable NER if not needed
# Import with: run_ner=false
```

---

### Slow Search Responses

**Symptoms:**

- Searches take 5+ seconds
- Frontend feels sluggish

**Solutions:**

```bash
# Check Weaviate query time
docker compose logs weaviate | grep -i slow

# Check number of chunks
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'
# Too many? (>10,000) → Increase CHUNK_SECONDS

# Check vector size
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1" | \
  jq '.objects[0].vector | length'
# Should be 384

# Restart Weaviate
docker compose restart weaviate
```

---

## Development Issues

### Hot Reload Not Working

**Symptoms:**

- Code changes not reflected
- Have to manually restart

**Solutions:**

```bash
# Check polling environment variables
docker compose exec frontend env | grep POLL

# Should show:
# WATCHPACK_POLLING=true
# CHOKIDAR_USEPOLLING=true

# Restart with fresh build
docker compose down
docker compose up --build
```

---

### TypeScript Errors

**Symptoms:**

- Type errors in IDE
- Build fails with type issues

**Solutions:**

```bash
# Regenerate Weaviate types
docker compose run --rm frontend yarn gen:weaviate-types

# Type check
docker compose run --rm frontend yarn type-check

# Clean and rebuild
rm -rf .next
docker compose up --build
```

---

## Docker Issues

### Disk Space Full

**Symptoms:**

```
no space left on device
```

**Solutions:**

```bash
# Check disk usage
docker system df -v

# Clean everything
docker system prune -a --volumes

# Remove specific volumes
docker volume rm portals_weaviate_data
docker volume rm portals_huggingface_cache

# Clean build cache
docker builder prune -a
```

---

### Cannot Connect to Docker Daemon

**Symptoms:**

```
Cannot connect to the Docker daemon
```

**Solutions:**

```bash
# Start Docker Desktop (macOS)
open -a Docker

# Check Docker is running
docker ps

# Restart Docker service (Linux)
sudo systemctl restart docker
```

---

## Data Issues

### Data Disappeared After Restart

**Cause:** Weaviate data is in Docker volume

**Solution:**

```bash
# Check if volume still exists
docker volume ls | grep weaviate

# If volume was removed:
# Reimport from JSON files
docker compose --profile local up
# Auto-imports from json/interviews/

# Prevent in future:
# Don't use: docker compose down -v
# Use: docker compose down (keeps volumes)
```

---

### Duplicate Data

**Symptoms:**

- Same interview appears multiple times
- Chunk count higher than expected

**Solution:**

```bash
# Clear and reimport
docker compose down
docker volume rm portals_weaviate_data
docker compose --profile local up

# Or clear via API
curl -X DELETE http://localhost:8080/v1/objects/Testimonies/{uuid}
```

---

## Getting Help

If issues persist:

1. **Collect diagnostics:**

```bash
# Save logs
docker compose logs > debug-logs.txt

# System info
docker version > debug-info.txt
docker compose version >> debug-info.txt
docker system df >> debug-info.txt

# Configuration
cat config.json > debug-config.json
docker compose config > debug-compose.yml
```

2. **Check documentation:**

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ENVIRONMENT.md](./ENVIRONMENT.md)
- [IMPORTING_INTERVIEWS.md](./IMPORTING_INTERVIEWS.md)

3. **Common solutions:**

- Clear everything: `docker compose down -v && docker compose up --build`
- Wait longer: First startup can take 2-3 minutes
- Check ports: Make sure 3000, 7070, 8080 are free
- Restart Docker: Sometimes fixes mysterious issues

4. **Still stuck?**

- Check container logs: `docker compose logs --tail=100`
- Verify all services healthy: `docker compose ps`
- Test each service individually (see health checks above)
