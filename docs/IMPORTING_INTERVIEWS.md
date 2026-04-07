# Importing Interviews

This guide covers how to import interview data into the portal, including format requirements, import process, and troubleshooting.

## Quick Import

```bash
# 1. Add interview JSON files
cp your-interviews/*.json json/interviews/

# 2. Run import
docker compose run --rm weaviate-init

# 3. Verify
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'
```

## Importing From TheirStory API

If you already have `storyIds` and need to generate importable JSONs directly from TheirStory, use:

```bash
export THEIRSTORY_AUTH_TOKEN='YOUR_TOKEN'
yarn theirstory:import-stories --ids '6998c9f5af83ef7a86a3a5a7,6998c6643f9d2efc9a710d42'
```

You can also pass a file:

```bash
yarn theirstory:import-stories --ids-file ./story-ids.txt
```

Or import every story from a project:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631
```

Or import every story from a folder:

```bash
yarn theirstory:import-stories --folder-id 64f7be18ac45f390f20066fa
```

To unpublish media instead of generating JSON files:

```bash
yarn theirstory:import-stories --ids '6998c9f5af83ef7a86a3a5a7' --unpublish
```

To validate stories without publishing, unpublishing, or writing files:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631 --validate
```

To validate and trigger generation for missing indexes/summaries before re-checking:

```bash
yarn theirstory:import-stories --project-id 654a840f91a6dbedb12d8631 --validate --generate-missing
```

Behavior:

- Calls `GET /transcripts/:storyId`
- Reads `story.custom_archive_media_type`
- Validates `transcript.transcript`, `story.indexes`, and `story.description` before importing
- Calls `GET /stories/:storyId/published_media_status?format=video|audio`
- Calls `POST /stories/:storyId/publish_media` with `{"format":"video"}` when the media type contains `video`
- Calls `POST /stories/:storyId/publish_media` with `{"format":"audio"}` otherwise
- Can fetch story IDs from `GET /projects/:projectId/stories?pageSize=15&page=N`
- Can fetch story IDs from `GET /folders/:folderId/stories?pageSize=15&page=N`
- Skips re-publishing when media is already published, but still exports the JSON using the existing published URL
- Replaces the `videoURL` from the transcript payload with the published media URL
- Adds `mux_playback_id` extracted from the Mux URL
- Saves one JSON per story under `json/interviews/imported/`
- Import stops by default when a story is missing required fields
- With `--unpublish`, skips stories that are already unpublished, calls `POST /stories/:storyId/unpublish_media` for the rest, and does not write files
- With `--validate`, only checks whether `transcript.transcript`, `story.indexes`, and `story.description` are present, then reports missing fields
- With `--validate --generate-missing`, triggers autochaptering when `story.indexes` is missing and summary generation when `story.description` is missing, then re-checks validation because the remote process can take a few minutes

Useful flags:

- `--out-dir json/interviews/my-batch`
- `--force` to overwrite existing files
- `--token` if you prefer not to use `THEIRSTORY_AUTH_TOKEN`
- `--page-size 30` to control project/folder pagination
- `--concurrency 5` to process multiple stories in parallel. Default: `3`
- `--format video` or `--format audio` to override automatic detection
- `--generate-missing` to generate missing indexes/summaries during validation and then validate again
- `--skip-invalid` to skip stories missing required fields during import
- `--unpublish` to unpublish the generated media instead of exporting JSON
- `--validate` to inspect required fields without processing stories

## Collections By Folder

You can organize interviews using folders under `json/interviews/`.
Each folder is treated as one collection.

```text
json/interviews/
├── interview-a.json                   # goes to collection_id=default
├── oral-history/
│   ├── collection.json                # optional metadata
│   ├── interview-1.json
│   └── interview-2.json
└── veterans/
    ├── collection.json
    └── interview-3.json
```

Rules:

- JSON files directly inside `json/interviews/` are imported into `collection_id=default`
- Each subfolder name becomes `collection_id` (sanitized) unless overridden in `collection.json`
- Collection metadata is loaded from `collection.json` (or `COLLECTION.md` / `README.md` fallback)
- `collection_id`, `collection_name`, `collection_description` are stored in both `Testimonies` and `Chunks`
- Interview identity in Weaviate is scoped by collection (`collection_id + story._id`), so the same `story._id` can exist in different collections

### `collection.json` format

```json
{
  "id": "oral-history",
  "name": "Oral History",
  "description": "Interviews from the oral history initiative.",
  "image": "/images/collections/oral-history.jpg"
}
```

`image` is optional and supports:

- Local path from `public/`, for example: `"/images/collections/oral-history.jpg"`
- External URL, for example: `"https://example.com/oral-history.jpg"`

Sample files included in the repo (ignored by default by importer):

- `json/interviews/example-collection/collection.json`
- `json/interviews/example-collection/interview-sample.json`
- `json/interviews/example-collection/EXAMPLE-minimum-interview.json`

## Interview JSON Format

Interviews must follow this structure:

```json
{
  "story": {
    "_id": "unique-interview-id",
    "title": "Interview Title",
    "description": "Interview description or summary",
    "duration": 3600,
    "record_date": "2024-01-15",
    "transcoded": "mux-video-id",
    "thumbnail_url": "https://example.com/thumbnail.jpg",
    "asset_id": "asset-123",
    "organization_id": "org-456",
    "project_id": "project-789",
    "custom_archive_media_type": "video/mp4",
    "author": {
      "full_name": "Interviewer Name"
    }
  },
  "videoURL": "https://stream.mux.com/video-id.m3u8",
  "transcript": {
    "sections": [
      {
        "title": "Introduction",
        "paragraphs": [
          {
            "speaker": "Interviewer",
            "words": [
              {
                "text": "Hello",
                "start": 0.5,
                "end": 1.2
              },
              {
                "text": "there",
                "start": 1.3,
                "end": 1.8
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Required Fields

- `story._id` - Unique identifier for the interview (must be unique within the same collection)
- `story.title` - Interview title
- `story.duration` - Length in seconds
- `transcript.sections` - Array of transcript sections
- `transcript.sections[].paragraphs[].words` - Word-level timing data

## Import Process

### Automatic Import (on startup)

When you run `docker compose up`, the `weaviate-init` container automatically:

1. Waits for Weaviate and NLP processor to be healthy
2. Generates Weaviate schema (Testimonies + Chunks classes)
3. Imports all JSON files from `/json/interviews/`
4. Exits when complete

### Manual Import

```bash
# Full import (schema + data)
docker compose run --rm weaviate-init

# Schema only
docker compose run --rm weaviate-init yarn weaviate:generate-schemas

# Data import only (assumes schema exists)
docker compose run --rm weaviate-init yarn weaviate:import
```

### What Happens During Import

For each interview JSON file:

#### 1. Schema Validation

- Checks required fields exist
- Validates JSON structure
- Extracts story ID and metadata

#### 2. NLP Processing (via POST /process-story)

**Sentence Chunking:**

- Splits transcript paragraphs into sentence-based chunks
- Uses configurable sentence overlap
- Merges small chunks (<10 words)
- Caps maximum chunk size (200 words)

**Embedding Generation:**

- Generates vectors using `sentence-transformers/LaBSE`
- One vector per chunk for semantic search

**Named Entity Recognition:**

- Extracts entities using GLiNER
- Identifies: person, organization, location, date, event, technology
- Maps entities to timestamps in transcript
- Stores with confidence scores

#### 3. Weaviate Storage

**Testimonies Class:**

- Full interview metadata
- Complete transcript JSON
- List of all speakers
- Aggregated NER labels

**Chunks Class:**

- Sentence-based transcript segments
- Embedding vector generated from `sentence-transformers/LaBSE`
- Word-level timestamps
- NER entities within chunk
- Cross-reference to parent Testimony

## Monitoring Import Progress

### Watch logs in real-time:

```bash
docker compose logs -f nlp-processor
```

### Check import status:

```bash
# Count imported testimonies
curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length'

# Count chunks
curl -s "http://localhost:8080/v1/objects?class=Chunks" | jq '.objects | length'

# View chunk quality stats
curl -s "http://localhost:8080/v1/objects?class=Chunks&limit=1000" | jq '{
  total: (.objects | length),
  ending_with_period: [.objects[].properties.transcription | select(endswith("."))] | length,
  avg_words: ([.objects[].properties.transcription | split(" ") | length] | add / length | floor)
}'
```

### Check specific interview:

```bash
# Get testimony by ID
curl -s "http://localhost:8080/v1/objects/Testimonies/{uuid}" | jq

# Get chunks for testimony
curl -s "http://localhost:8080/v1/graphql" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{
      Get {
        Chunks(where: {path: [\"theirstory_id\"], operator: Equal, valueText: \"YOUR-ID\"}) {
          transcription
          start_time
          end_time
        }
      }
    }"
  }' | jq
```

## Re-importing Data

### Clear and reimport everything:

```bash
# Stop services
docker compose down

# Remove database (keeps models cached)
docker volume rm portals_weaviate_data

# Restart and reimport
docker compose --profile local up
```

### Reimport without clearing:

```bash
# This will delete existing data for interviews being processed
docker compose run --rm weaviate-init
```

**Note**: The import process automatically deletes existing chunks for each testimony before reimporting to avoid duplicates.

## Import Performance

**Typical speeds:**

- ~1-2 minutes per hour of interview content
- Depends on: transcript length, CPU, model cache status

**Bottlenecks:**

- NER processing (most time-consuming)
- Embedding generation
- Weaviate batch insertion

**Optimization tips:**

- Increase `SENTENCE_CHUNK_SIZE` to create fewer, larger chunks
- Lower `GLINER_THRESHOLD` to reduce NER processing
- Process interviews in batches rather than all at once

## Troubleshooting Import Issues

### Import fails with "story id missing"

**Cause**: JSON missing required `story._id` field

**Solution**:

```bash
# Validate JSON structure
cat json/interviews/problem.json | jq '.story._id'
```

### Chunks not being created

**Cause**: Transcript sections have no word timing data

**Solution**: Check that words have `start` and `end` timestamps:

```bash
cat json/interviews/problem.json | jq '.transcript.sections[0].paragraphs[0].words[0]'
```

### NLP processor timeout

**Cause**: Interview too long or NLP service not healthy

**Solution**:

```bash
# Check NLP health
curl http://localhost:7070/health

# View logs
docker compose logs --tail=100 nlp-processor

# Restart service
docker compose restart nlp-processor
```

### Weaviate connection refused

**Cause**: Weaviate not fully started yet

**Solution**:

```bash
# Wait for healthy status
docker compose ps

# Check health endpoint
curl http://localhost:8080/v1/.well-known/ready
```

## Batch Import Strategies

### Small datasets (<10 interviews)

```bash
# Just import all at once
docker compose run --rm weaviate-init
```

### Medium datasets (10-100 interviews)

```bash
# Split into batches
mv json/interviews/*.json /tmp/all_interviews/
mkdir -p json/interviews

# Process in batches of 10
for batch in {1..10}; do
  mv /tmp/all_interviews/interview-$batch-*.json json/interviews/
  docker compose run --rm weaviate-init
  rm json/interviews/*.json
done
```

### Large datasets (100+ interviews)

- Use the NLP processor API directly with custom batch scripts
- Consider parallel processing
- Monitor Weaviate memory usage
- Use incremental imports

## Validating Import Results

### Check for missing data:

```bash
# Expected vs actual testimonies
EXPECTED=10
ACTUAL=$(curl -s "http://localhost:8080/v1/objects?class=Testimonies" | jq '.objects | length')
echo "Expected: $EXPECTED, Actual: $ACTUAL"

# Verify chunks exist for all testimonies
curl -s "http://localhost:8080/v1/objects?class=Testimonies&limit=1000" | \
  jq -r '.objects[].id' | \
  while read uuid; do
    COUNT=$(curl -s "http://localhost:8080/v1/graphql" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"{Get {Chunks(where: {path: [\\\"theirstory_id\\\"], operator: Equal, valueText: \\\"$uuid\\\"}) {_additional {id}}}}\"}" | \
      jq '.data.Get.Chunks | length')
    echo "Testimony $uuid: $COUNT chunks"
  done
```

### Verify NER extraction:

```bash
# Count testimonies with NER data
curl -s "http://localhost:8080/v1/objects?class=Testimonies&limit=1000" | \
  jq '[.objects[] | select(.properties.ner_labels | length > 0)] | length'
```

## Advanced: Direct API Usage

For programmatic imports or custom workflows:

```bash
# Process single interview via API
curl -X POST http://localhost:7070/process-story \
  -H "Content-Type: application/json" \
  -d @json/interviews/example.json \
  | jq '.counts'

# With custom chunking parameters
curl -X POST "http://localhost:7070/process-story?chunk_seconds=60&overlap_seconds=10" \
  -H "Content-Type: application/json" \
  -d @json/interviews/example.json
```

For more details, see the NLP processor API documentation in the main README.
