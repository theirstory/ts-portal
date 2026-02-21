# NLP Processor - Project Structure

## Overview

This service processes testimonies with NER (Named Entity Recognition) and text chunking capabilities, storing results in Weaviate.

## Module Structure

### `config.py`

Central configuration management for the service.

- Loads environment variables
- Manages NER labels from config file or environment
- Provides configuration validation and printing

### `utils.py`

General utility functions used across the application.

- `convert_to_uuid()`: UUID normalization and conversion
- `safe_get()`: Safe nested dictionary navigation
- `normalize_text()`: Text normalization
- `words_to_text()`: Convert word objects to text
- `to_weaviate_date()`: Date format conversion for Weaviate

### `ner_processor.py`

Named Entity Recognition processing with GLiNER and spaCy.

- `gliner_custom_component`: spaCy pipeline component for GLiNER
- `ensure_ner_pipe()`: Pipeline initialization
- `safe_ner_process()`: Robust NER processing with error handling
- `build_word_char_spans()`: Character span building for words
- `map_entity_to_time()`: Map entities to time ranges

### `chunker.py`

Sentence-based text chunking using spaCy sentence segmentation.

- `chunk_words_by_sentences()`: Group whole sentences into chunks within min/max word limits

### `transformers.py`

Data transformation for API format conversion.

- `convert_api_format_to_sections()`: Main transformation function
- `_create_single_section()`: Handle non-indexed transcripts
- `_create_indexed_sections()`: Handle indexed transcripts
- `_calculate_section_end()`: Calculate section boundaries
- `_extract_section_words()`: Extract words for sections

### `weaviate_client.py`

Weaviate database operations.

- `weaviate_batch_insert()`: Batch insert objects
- `weaviate_upsert_object()`: Create or update single object
- `weaviate_delete_chunks_by_story()`: Delete chunks by testimony ID

### `main.py`

FastAPI application with endpoints.

- `POST /process-story`: Main processing endpoint
- `GET /health`: Health check endpoint

## Environment Variables

See `.env.example` for all available configuration options:

- **Weaviate**: `WEAVIATE_HOST_URL`, `WEAVIATE_PORT`, `WEAVIATE_SECURE`
- **Chunking**: `MIN_WORDS_PER_CHUNK`, `MAX_WORDS_PER_CHUNK`, `OVERLAP_SENTENCES`
- **NER**: `NER_LABELS`, `GLINER_MODEL`, `GLINER_THRESHOLD`, `MIN_TEXT_LENGTH_FOR_NER`
- **Config**: `CONFIG_PATH`

## Processing Flow

1. **API Request** → Receives story payload
2. **Transform** → Convert API format to sections structure
3. **Chunk** → Split text into sentence-based chunks with overlap
4. **NER** → Extract named entities from each chunk
5. **Consolidate** → Aggregate NER data into testimony object
6. **Store** → Write to Weaviate (optional)

## Development

### Running the Service

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Testing

```bash
# Check syntax
python3 -m py_compile *.py

# Test health endpoint
curl http://localhost:8000/health
```
