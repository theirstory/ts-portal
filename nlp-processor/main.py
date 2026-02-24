import json
import logging
import time
import traceback
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from chunker import chunk_words_by_time
from config import Config, NER_LABELS
from embedding_service import LocalEmbedding
from functools import lru_cache
from ner_processor import (
    build_word_char_spans,
    get_safe_token_limit,
    map_entity_to_time,
    safe_ner_process,
)
from data_transformers import convert_api_format_to_sections
from utils import convert_to_uuid, safe_get, to_weaviate_date, words_to_text
from weaviate_client import (
    weaviate_batch_insert,
    weaviate_delete_chunks_by_story,
    weaviate_upsert_object,
)


# Print configuration on startup
Config.print_config()


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("nlp-processor.main")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("huggingface_hub").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


# Configure logging to filter out health check requests
class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/health") == -1


logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())

class ProcessRequest(BaseModel):
    """Request model for story processing endpoint."""
    payload: Dict[str, Any]
    collection: Optional[Dict[str, str]] = None


app = FastAPI(title="NLP Processor (Chunks + NER)")


@app.post("/process-story")
async def process_story(
    req: ProcessRequest,
    write_to_weaviate: bool = Query(True),
    chunk_seconds: float = Query(Config.DEFAULT_CHUNK_SECONDS),
    overlap_seconds: float = Query(Config.DEFAULT_CHUNK_OVERLAP_SECONDS),
    run_ner: bool = Query(True),
):
    """Process a story with chunking and NER, optionally writing to Weaviate.
    
    Args:
        req: Request containing story payload
        write_to_weaviate: Whether to write results to Weaviate
        chunk_seconds: Duration of each chunk in seconds
        overlap_seconds: Overlap between chunks in seconds
        run_ner: Whether to run NER processing
        
    Returns:
        JSON response with processed testimony and chunks
    """
    t0 = time.time()
    
    print("\n" + "="*70)
    print("📥 PROCESSING REQUEST RECEIVED")
    print("="*70)
    
    try:
        payload = req.payload

        # Collection metadata (injected by import pipeline)
        req_collection = req.collection or {}
        collection_id = (
            (req_collection.get("id") or "").strip()
            or str(safe_get(payload, ["story", "collection_id"], "")).strip()
            or "Collection"
        )
        collection_name = (
            (req_collection.get("name") or "").strip()
            or str(safe_get(payload, ["story", "collection_name"], "")).strip()
            or collection_id.replace("-", " ").replace("_", " ").title()
        )
        collection_description = (
            (req_collection.get("description") or "").strip()
            or str(safe_get(payload, ["story", "collection_description"], "")).strip()
            or ""
        )
        collection_id_for_uuid = collection_id.strip().lower() or "default"
        
        # Extract story metadata
        story_id = (
            safe_get(payload, ["story", "_id"], None) or 
            safe_get(payload, ["transcript", "storyId"], None)
        )
        
        print(f"📌 Story ID: {story_id}")
                    
        if not story_id:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Missing story id. Expected payload.story._id or payload.transcript.storyId"
                },
            )
        
        record_date = safe_get(payload, ["story", "record_date"], None)
        title = safe_get(payload, ["story", "title"], None)
        description = safe_get(payload, ["story", "description"], None)
        
        print(f"📝 Title: {title or 'No title'}")
        print(f"📅 Date: {record_date or 'No date'}")
        print(f"🗂️ Collection: {collection_id} ({collection_name})")

        custom_archive_media_type = safe_get(payload, ["story", "custom_archive_media_type"], None)
        isAudioFile = bool(custom_archive_media_type and str(custom_archive_media_type).startswith("audio"))
        
        # Convert API format to sections
        sections = convert_api_format_to_sections(payload)
        testimony_uuid = convert_to_uuid(f"{collection_id_for_uuid}:{story_id}")
        
        # Build testimony data with sections
        testimony_data = {
            "id": str(story_id),
            "weaviate_uuid": testimony_uuid,
            "theirstory_id": testimony_uuid,
            "title": title or "",
            "interview_description": description or "",
            "interview_duration": float(safe_get(payload, ["story", "duration"], 0) or 0),
            "transcoded": safe_get(payload, ["story", "transcoded"], "") or "",
            "thumbnail_url": safe_get(payload, ["story", "thumbnail_url"], "") or "",
            "video_url": safe_get(payload, ["videoURL"], "") or "",
            "date": record_date or "",
            "sections": sections,
            "asset_id": safe_get(payload, ["story", "asset_id"], "") or "",
            "organization_id": safe_get(payload, ["story", "organization_id"], "") or "",
            "project_id": safe_get(payload, ["story", "project_id"], "") or "",
            "isAudioFile": isAudioFile,
            "collection_id": collection_id,
            "collection_name": collection_name,
            "collection_description": collection_description,
        }
        
        # Extract speakers from sections
        speakers = []
        for section in sections:
            for para in section.get("paragraphs", []):
                speaker = para.get("speaker", "")
                if speaker and speaker not in speakers:
                    speakers.append(speaker)
        
        # Create Weaviate testimony object
        testimony_obj = {
            "class": "Testimonies",
            "id": testimony_uuid,
            "properties": {
                "interview_title": title or "",
                "recording_date": record_date or "",
                "interview_description": description or "",
                "transcription": json.dumps(testimony_data, ensure_ascii=False),
                "transcoded": safe_get(payload, ["story", "transcoded"], "") or "",
                "interview_duration": float(safe_get(payload, ["story", "duration"], 0) or 0),
                "participants": speakers,
                "video_url": safe_get(payload, ["videoURL"], "") or "",
                "publisher": safe_get(payload, ["story", "author", "full_name"], "") or "",
                "ner_labels": [],
                "ner_data": [],
                "isAudioFile": isAudioFile,
                "collection_id": collection_id,
                "collection_name": collection_name,
                "collection_description": collection_description,
            },
        }
        
        # STEP 1: Run NER with dynamic batching based on token limits
        print(f"\n🏷️  Running NER with dynamic batching...")
        safe_token_limit = 300
        
        all_entities = []
        ner_stats = {
            "batches_processed": 0,
            "paragraphs_processed": 0,
            "skipped_too_short": 0,
            "skipped_gliner_bug": 0,
            "entities_found": 0,
            "errors": 0,
        }
        
        if run_ner:
            safe_token_limit = get_safe_token_limit(default_fallback=300)
            print(f"   📏 NER safe token limit: {safe_token_limit}")

            # Collect all paragraphs with their metadata
            all_paragraphs = []
            for section_idx, section in enumerate(sections):
                for para_idx, para in enumerate(section.get("paragraphs", [])):
                    para_words = para.get("words", [])
                    if para_words:
                        all_paragraphs.append({
                            "words": para_words,
                            "section_idx": section_idx,
                            "para_idx": para_idx
                        })
            
            print(f"   📊 Total paragraphs to process: {len(all_paragraphs)}")
            
            # Split paragraphs that are too long
            max_para_tokens = safe_token_limit  # Use same limit
            split_paragraphs = []
            
            for para_info in all_paragraphs:
                para_text = words_to_text(para_info["words"])
                estimated_tokens = len(para_text.split()) * 1.3
                
                if estimated_tokens > max_para_tokens:
                    # Split long paragraph into smaller chunks
                    words = para_info["words"]
                    chunk_size = int(len(words) * max_para_tokens / estimated_tokens)
                    
                    for i in range(0, len(words), chunk_size):
                        split_paragraphs.append({
                            **para_info,
                            "words": words[i:i + chunk_size]
                        })
                else:
                    split_paragraphs.append(para_info)
            
            all_paragraphs = split_paragraphs
            print(f"   📏 After splitting long paragraphs: {len(all_paragraphs)} total")
            
            # Batch paragraphs by token count
            current_batch = []
            batch_num = 0
            
            for para_info in all_paragraphs:
                para_words = para_info["words"]
                para_text = words_to_text(para_words)
                
                # Rough token estimation (1 word ≈ 1.3 tokens)
                estimated_tokens = len(para_text.split()) * 1.3
                
                # Check if adding this paragraph would exceed limit
                current_batch_tokens = sum(len(words_to_text(p["words"]).split()) * 1.3 for p in current_batch)
                
                if current_batch and (current_batch_tokens + estimated_tokens) > safe_token_limit:
                    # Process current batch
                    batch_num += 1
                    batch_text = " ".join(words_to_text(p["words"]) for p in current_batch)
                    batch_all_words = [w for p in current_batch for w in p["words"]]
                    batch_spans = build_word_char_spans(batch_all_words)
                    
                    print(f"   🔄 Processing batch {batch_num} ({len(current_batch)} paragraphs, ~{int(current_batch_tokens)} tokens)...")
                    
                    try:
                        ents, reason = safe_ner_process(batch_text)
                        ner_stats["batches_processed"] += 1
                        ner_stats["paragraphs_processed"] += len(current_batch)
                        
                        if reason == "too_short":
                            ner_stats["skipped_too_short"] += 1
                        elif reason == "gliner_bug_empty":
                            ner_stats["skipped_gliner_bug"] += 1
                        else:
                            # Map entities to timestamps
                            for ent in ents:
                                label = (getattr(ent, "label_", None) or "").strip()
                                text = (getattr(ent, "text", None) or "").strip()
                                if not label or not text:
                                    continue
                                
                                start_time, end_time = map_entity_to_time(
                                    ent.start_char, ent.end_char, batch_spans
                                )
                                if start_time is None or end_time is None:
                                    continue
                                
                                all_entities.append({
                                    "text": text,
                                    "label": label,
                                    "start_time": float(start_time),
                                    "end_time": float(end_time),
                                    "char_start": ent.start_char,
                                    "char_end": ent.end_char
                                })
                                ner_stats["entities_found"] += 1
                    except Exception as e:
                        print(f"      ⚠️  NER error in batch {batch_num}: {e}")
                        ner_stats["errors"] += 1
                    
                    # Reset batch
                    current_batch = []
                
                # Add paragraph to current batch
                current_batch.append(para_info)
            
            # Process remaining batch
            if current_batch:
                batch_num += 1
                batch_text = " ".join(words_to_text(p["words"]) for p in current_batch)
                batch_all_words = [w for p in current_batch for w in p["words"]]
                batch_spans = build_word_char_spans(batch_all_words)
                current_batch_tokens = sum(len(words_to_text(p["words"]).split()) * 1.3 for p in current_batch)
                
                print(f"   🔄 Processing batch {batch_num} ({len(current_batch)} paragraphs, ~{int(current_batch_tokens)} tokens)...")
                
                try:
                    ents, reason = safe_ner_process(batch_text)
                    ner_stats["batches_processed"] += 1
                    ner_stats["paragraphs_processed"] += len(current_batch)
                    
                    if reason == "too_short":
                        ner_stats["skipped_too_short"] += 1
                    elif reason == "gliner_bug_empty":
                        ner_stats["skipped_gliner_bug"] += 1
                    else:
                        for ent in ents:
                            label = (getattr(ent, "label_", None) or "").strip()
                            text = (getattr(ent, "text", None) or "").strip()
                            if not label or not text:
                                continue
                            
                            start_time, end_time = map_entity_to_time(
                                ent.start_char, ent.end_char, batch_spans
                            )
                            if start_time is None or end_time is None:
                                continue
                            
                            all_entities.append({
                                "text": text,
                                "label": label,
                                "start_time": float(start_time),
                                "end_time": float(end_time),
                                "char_start": ent.start_char,
                                "char_end": ent.end_char
                            })
                            ner_stats["entities_found"] += 1
                except Exception as e:
                    print(f"      ⚠️  NER error in batch {batch_num}: {e}")
                    ner_stats["errors"] += 1
            
            print(f"   ✅ Total entities found: {len(all_entities)} across {batch_num} batches")
        else:
            print(f"   ⏭️  NER skipped (run_ner={run_ner})")
        
        # STEP 2: Process chunking by sections
        print(f"\n🔪 STARTING CHUNKING (chunk_seconds={chunk_seconds}, overlap={overlap_seconds})...")
        chunks_objects: List[Dict[str, Any]] = []
        
        # Collect ALL chunks first, then batch generate embeddings
        all_chunk_texts = []
        all_chunk_data = []
        
        # Process each section
        for section_idx, section in enumerate(sections):
            section_title = section.get("title", f"Section {section_idx}")
            print(f"\n  📂 Section {section_idx + 1}/{len(sections)}: {section_title}")
            
            # Process each paragraph in the section
            for para_idx, paragraph in enumerate(section.get("paragraphs", [])):
                para_words = paragraph.get("words", [])
                
                print(f"     └─ Processing paragraph {para_idx + 1}...")
                
                # Chunk words within this paragraph by time (hybrid: time + sentence boundaries)
                para_chunks = chunk_words_by_time(
                    para_words, 
                    chunk_seconds, 
                    overlap_seconds,
                    min_words=Config.MIN_WORDS_PER_CHUNK,
                    max_words=Config.MAX_WORDS_PER_CHUNK,
                    prefer_sentence_breaks=Config.PREFER_SENTENCE_BREAKS,
                    lookahead_seconds=Config.LOOKAHEAD_SECONDS
                )
                
                for word_list in para_chunks:
                    chunk_text = words_to_text(word_list)
                    
                    # Skip empty chunks
                    if not chunk_text:
                        continue
                    
                    # Skip chunks that are too short
                    if len(chunk_text.strip()) < Config.MIN_CHARS_PER_CHUNK:
                        continue
                    
                    if len(word_list) < Config.MIN_WORDS_PER_CHUNK:
                        continue
                    
                    word_timestamps = [
                        {
                            "start": float(w["start"]),
                            "end": float(w["end"]),
                            "text": str(w.get("text") or "")
                        }
                        for w in word_list
                        if isinstance(w, dict) and "start" in w and "end" in w and w.get("text") is not None
                    ]
                    
                    start_time = float(word_list[0]["start"])
                    end_time = float(word_list[-1]["end"])
                    
                    # Store chunk data for later batch processing
                    all_chunk_texts.append(chunk_text)
                    all_chunk_data.append({
                        "start_time": start_time,
                        "end_time": end_time,
                        "word_timestamps": word_timestamps,
                        "section_title": section_title,
                        "speaker": paragraph.get("speaker", "Unknown"),
                        "section_idx": section_idx,
                        "para_idx": para_idx,
                    })
        
        # Batch generate ALL embeddings at once
        if all_chunk_texts:
            print(f"\n🧮 Generating {len(all_chunk_texts)} embeddings in batch...")
            t_embed = time.time()
            try:
                chunk_vectors = LocalEmbedding.encode(all_chunk_texts, batch_size=32)
            except Exception as exc:
                logger.exception("Embedding generation failed")
                raise RuntimeError(
                    "Failed to load/generate embeddings. "
                    "Check EMBEDDING_MODEL, HuggingFace connectivity/cache, and try "
                    "'sentence-transformers/all-MiniLM-L6-v2'."
                ) from exc
            print(f"   ✅ Embeddings generated in {time.time() - t_embed:.2f}s")
            
            # Create chunk objects with their embeddings
            for idx, (chunk_text, chunk_data, chunk_vector) in enumerate(zip(all_chunk_texts, all_chunk_data, chunk_vectors)):
                # Filter entities that fall within this chunk's time range
                chunk_start = chunk_data["start_time"]
                chunk_end = chunk_data["end_time"]
                
                chunk_entities = [
                    {
                        "text": ent["text"],
                        "label": ent["label"],
                        "start_time": ent["start_time"],
                        "end_time": ent["end_time"]
                    }
                    for ent in all_entities
                    if (ent["start_time"] >= chunk_start and ent["start_time"] < chunk_end) or
                       (ent["end_time"] > chunk_start and ent["end_time"] <= chunk_end) or
                       (ent["start_time"] < chunk_start and ent["end_time"] > chunk_end)
                ]
                
                chunk_labels = list(set(ent["label"] for ent in chunk_entities))
                
                chunks_objects.append({
                    "class": "Chunks",
                    "properties": {
                        "theirstory_id": testimony_uuid,
                        "chunk_id": idx,
                        "start_time": chunk_data["start_time"],
                        "end_time": chunk_data["end_time"],
                        "transcription": chunk_text,
                        "interview_title": title or "",
                        "recording_date": record_date or "",
                        "interview_duration": float(safe_get(payload, ["story", "duration"], 0) or 0),
                        "word_timestamps": chunk_data["word_timestamps"],
                        "ner_data": chunk_entities,
                        "ner_labels": chunk_labels,
                        "ner_text": [ent["text"] for ent in chunk_entities],
                        "belongsToTestimony": [{
                            "beacon": f"weaviate://localhost/Testimonies/{testimony_uuid}"
                        }],
                        "section_title": chunk_data["section_title"],
                        "speaker": chunk_data["speaker"],
                        "asset_id": safe_get(payload, ["story", "asset_id"], "") or "",
                        "organization_id": safe_get(payload, ["story", "organization_id"], "") or "",
                        "project_id": safe_get(payload, ["story", "project_id"], "") or "",
                        "section_id": int(chunk_data["section_idx"]),
                        "para_id": int(chunk_data["para_idx"]),
                        "transcoded": safe_get(payload, ["story", "transcoded"], "") or "",
                        "thumbnail_url": safe_get(payload, ["story", "thumbnail_url"], "") or "",
                        "date": to_weaviate_date(record_date),
                        "video_url": safe_get(payload, ["videoURL"], "") or "",
                        "isAudioFile": isAudioFile,
                        "collection_id": collection_id,
                        "collection_name": collection_name,
                        "collection_description": collection_description,
                    },
                    "vectors": {
                        "transcription_vector": chunk_vector.tolist() if hasattr(chunk_vector, 'tolist') else list(chunk_vector)
                    }
                })
        
        # Consolidate NER data from all entities into testimony
        testimony_obj["properties"]["ner_data"] = all_entities
        testimony_obj["properties"]["ner_labels"] = list(set(ent["label"] for ent in all_entities))
        
        print(f"\n✅ CHUNKING COMPLETED: {len(chunks_objects)} total chunks")
        print(f"\n📊 NER Statistics:")
        print(f"   - Batches processed: {ner_stats['batches_processed']}")
        print(f"   - Paragraphs processed: {ner_stats['paragraphs_processed']}")
        print(f"   - Total entities found: {ner_stats['entities_found']}")
        if all_entities:
            print(f"   - Unique entity types: {len(set(ent['label'] for ent in all_entities))}")
        if ner_stats['skipped_too_short'] > 0:
            print(f"   - Skipped (text too short): {ner_stats['skipped_too_short']}")
        if ner_stats['skipped_gliner_bug'] > 0:
            print(f"   - Skipped (GLiNER bug): {ner_stats['skipped_gliner_bug']}")
        if ner_stats['errors'] > 0:
            print(f"   - Errors: {ner_stats['errors']}")
        
        result: Dict[str, Any] = {
            "testimony": testimony_obj,
            "chunks": chunks_objects,
            "counts": {"chunks": len(chunks_objects)},
            "ner_stats": ner_stats,
        }
        
        # Write to Weaviate if requested
        if write_to_weaviate:
            print(f"\n💾 WRITING TO WEAVIATE...")
            print(f"   🗑️  Deleting previous chunks...")
            await weaviate_delete_chunks_by_story(testimony_uuid)
            
            await weaviate_upsert_object("Testimonies", testimony_uuid, testimony_obj["properties"])
            
            if chunks_objects:
                await weaviate_batch_insert(chunks_objects)
            else:
                print(f"   ⚠️  No chunks to insert")
        
        elapsed = time.time() - t0
        print(f"\n🎉 PROCESSING COMPLETED IN {elapsed:.2f}s")
        print("="*70 + "\n")
        
        return result
    
    except Exception as e:
        tb = traceback.format_exc()
        print(f"\n❌ PROCESSING ERROR: {repr(e)}")
        print(tb)
        print("="*70 + "\n")
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "trace": tb[:4000]},
        )

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    vector: List[float]
    dim: int

@lru_cache(maxsize=2048)
def _embed_cached(text: str) -> List[float]:
    vec = LocalEmbedding.encode_single(text)
    return [float(x) for x in vec]

@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    try:
        vec = _embed_cached(text)
    except Exception as exc:
        logger.exception("Embed endpoint failed while loading/generating embedding")
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load/generate embeddings. Check EMBEDDING_MODEL, "
                "HuggingFace cache/connectivity, and try "
                "'sentence-transformers/all-MiniLM-L6-v2'."
            ),
        ) from exc

    if not vec:
        raise HTTPException(status_code=500, detail="embedding returned empty vector")

    return {"vector": vec, "dim": len(vec)}

@app.get("/health")
async def health():
    """Health check endpoint.
    
    Returns:
        JSON with service status and configuration
    """
    return {
        "ok": True,
        "weaviate_url": Config.WEAVIATE_URL,
        "gliner_model": Config.GLINER_MODEL,
        "embedding_model": Config.EMBEDDING_MODEL,
        "embedding_loaded": LocalEmbedding.is_loaded(),
        "embedding_dimension": (
            LocalEmbedding.get_embedding_dimension() if LocalEmbedding.is_loaded() else None
        ),
        "use_gpu": Config.USE_GPU,
        "labels_count": len(NER_LABELS),
        "min_text_length_for_ner": Config.MIN_TEXT_LENGTH_FOR_NER,
    }
