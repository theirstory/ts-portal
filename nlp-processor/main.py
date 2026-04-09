import json
import logging
import time
import traceback
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

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
from pipeline import TheirStoryTranscriptParser
from sentence_chunker import chunk_doc_sections
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
    folder: Optional[Dict[str, str]] = None


app = FastAPI(title="NLP Processor (Chunks + NER)")


@lru_cache(maxsize=1)
def get_transcript_parser() -> TheirStoryTranscriptParser:
    """Lazily initialize the transcript parser."""
    logger.info("[Pipeline] Loading TheirStory transcript parser")
    return TheirStoryTranscriptParser()


def _resolve_collection_metadata(
    payload: Dict[str, Any],
    req_collection: Optional[Dict[str, str]],
) -> Dict[str, str]:
    collection = req_collection or {}
    collection_id = (
        (collection.get("id") or "").strip()
        or str(safe_get(payload, ["story", "collection_id"], "")).strip()
        or "Collection"
    )
    collection_name = (
        (collection.get("name") or "").strip()
        or str(safe_get(payload, ["story", "collection_name"], "")).strip()
        or collection_id.replace("-", " ").replace("_", " ").title()
    )
    collection_description = (
        (collection.get("description") or "").strip()
        or str(safe_get(payload, ["story", "collection_description"], "")).strip()
        or ""
    )
    return {
        "id": collection_id,
        "name": collection_name,
        "description": collection_description,
        "uuid_prefix": collection_id.strip().lower() or "default",
    }


def _resolve_folder_metadata(
    payload: Dict[str, Any],
    req_folder: Optional[Dict[str, str]],
) -> Dict[str, str]:
    folder = req_folder or {}
    folder_id = (
        (folder.get("id") or "").strip()
        or str(safe_get(payload, ["story", "folder_id"], "")).strip()
    )
    folder_name = (
        (folder.get("name") or "").strip()
        or str(safe_get(payload, ["story", "folder_name"], "")).strip()
    )
    folder_path = (
        (folder.get("path") or "").strip()
        or str(safe_get(payload, ["story", "folder_path"], "")).strip()
    )
    return {
        "id": folder_id,
        "name": folder_name,
        "path": folder_path,
    }


def _extract_story_metadata(payload: Dict[str, Any]) -> Dict[str, Any]:
    story_id = safe_get(payload, ["story", "_id"], None) or safe_get(payload, ["transcript", "storyId"], None)
    custom_archive_media_type = safe_get(payload, ["story", "custom_archive_media_type"], None)
    return {
        "story_id": story_id,
        "record_date": safe_get(payload, ["story", "record_date"], None),
        "title": safe_get(payload, ["story", "title"], None),
        "description": safe_get(payload, ["story", "description"], None),
        "duration": float(safe_get(payload, ["story", "duration"], 0) or 0),
        "transcoded": safe_get(payload, ["story", "transcoded"], "") or "",
        "thumbnail_url": safe_get(payload, ["story", "thumbnail_url"], "") or "",
        "video_url": safe_get(payload, ["videoURL"], "") or "",
        "asset_id": safe_get(payload, ["story", "asset_id"], "") or "",
        "organization_id": safe_get(payload, ["story", "organization_id"], "") or "",
        "project_id": safe_get(payload, ["story", "project_id"], "") or "",
        "publisher": safe_get(payload, ["story", "author", "full_name"], "") or "",
        "is_audio_file": bool(
            custom_archive_media_type and str(custom_archive_media_type).startswith("audio")
        ),
    }


def _build_testimony_data(
    sections: List[Dict[str, Any]],
    testimony_uuid: str,
    story_meta: Dict[str, Any],
    collection_meta: Dict[str, str],
    folder_meta: Dict[str, str],
) -> Dict[str, Any]:
    return {
        "id": str(story_meta["story_id"]),
        "weaviate_uuid": testimony_uuid,
        "theirstory_id": testimony_uuid,
        "title": story_meta["title"] or "",
        "interview_description": story_meta["description"] or "",
        "interview_duration": story_meta["duration"],
        "transcoded": story_meta["transcoded"],
        "thumbnail_url": story_meta["thumbnail_url"],
        "video_url": story_meta["video_url"],
        "date": story_meta["record_date"] or "",
        "sections": sections,
        "asset_id": story_meta["asset_id"],
        "organization_id": story_meta["organization_id"],
        "project_id": story_meta["project_id"],
        "isAudioFile": story_meta["is_audio_file"],
        "collection_id": collection_meta["id"],
        "collection_name": collection_meta["name"],
        "collection_description": collection_meta["description"],
        "folder_id": folder_meta["id"],
        "folder_name": folder_meta["name"],
        "folder_path": folder_meta["path"],
    }


def _extract_speakers(sections: List[Dict[str, Any]]) -> List[str]:
    seen = set()
    speakers: List[str] = []
    for section in sections:
        for para in section.get("paragraphs", []):
            speaker = para.get("speaker", "")
            if speaker and speaker not in seen:
                seen.add(speaker)
                speakers.append(speaker)
    return speakers


def _build_testimony_object(
    testimony_uuid: str,
    testimony_data: Dict[str, Any],
    story_meta: Dict[str, Any],
    collection_meta: Dict[str, str],
    folder_meta: Dict[str, str],
    speakers: List[str],
) -> Dict[str, Any]:
    return {
        "class": "Testimonies",
        "id": testimony_uuid,
        "properties": {
            "interview_title": story_meta["title"] or "",
            "recording_date": story_meta["record_date"] or "",
            "interview_description": story_meta["description"] or "",
            "transcription": json.dumps(testimony_data, ensure_ascii=False),
            "transcoded": story_meta["transcoded"],
            "interview_duration": story_meta["duration"],
            "participants": speakers,
            "video_url": story_meta["video_url"],
            "publisher": story_meta["publisher"],
            "ner_labels": [],
            "ner_data": [],
            "isAudioFile": story_meta["is_audio_file"],
            "collection_id": collection_meta["id"],
            "collection_name": collection_meta["name"],
            "collection_description": collection_meta["description"],
            "folder_id": folder_meta["id"],
            "folder_name": folder_meta["name"],
            "folder_path": folder_meta["path"],
        },
    }


def _empty_ner_stats() -> Dict[str, int]:
    return {
        "batches_processed": 0,
        "paragraphs_processed": 0,
        "skipped_too_short": 0,
        "skipped_gliner_bug": 0,
        "entities_found": 0,
        "errors": 0,
    }


def _collect_ner_paragraphs(sections: List[Dict[str, Any]], safe_token_limit: int) -> List[Dict[str, Any]]:
    all_paragraphs: List[Dict[str, Any]] = []
    for section_idx, section in enumerate(sections):
        for para_idx, para in enumerate(section.get("paragraphs", [])):
            para_words = para.get("words", [])
            if para_words:
                all_paragraphs.append({"words": para_words, "section_idx": section_idx, "para_idx": para_idx})

    print(f"   📊 Total paragraphs to process: {len(all_paragraphs)}")

    split_paragraphs: List[Dict[str, Any]] = []
    for para_info in all_paragraphs:
        para_text = words_to_text(para_info["words"])
        estimated_tokens = len(para_text.split()) * 1.3

        if estimated_tokens > safe_token_limit:
            words = para_info["words"]
            chunk_size = max(1, int(len(words) * safe_token_limit / estimated_tokens))
            for i in range(0, len(words), chunk_size):
                split_paragraphs.append({**para_info, "words": words[i:i + chunk_size]})
        else:
            split_paragraphs.append(para_info)

    print(f"   📏 After splitting long paragraphs: {len(split_paragraphs)} total")
    return split_paragraphs


def _append_batch_entities(
    batch_text: str,
    batch_words: List[Dict[str, Any]],
    batch_size: int,
    batch_num: int,
    approx_tokens: int,
    all_entities: List[Dict[str, Any]],
    ner_stats: Dict[str, int],
) -> None:
    batch_spans = build_word_char_spans(batch_words)
    print(f"   🔄 Processing batch {batch_num} ({batch_size} paragraphs, ~{approx_tokens} tokens)...")

    try:
        ents, reason = safe_ner_process(batch_text)
        ner_stats["batches_processed"] += 1
        ner_stats["paragraphs_processed"] += batch_size

        if reason == "too_short":
            ner_stats["skipped_too_short"] += 1
            return
        if reason == "gliner_bug_empty":
            ner_stats["skipped_gliner_bug"] += 1
            return

        for ent in ents:
            label = (getattr(ent, "label_", None) or "").strip()
            text = (getattr(ent, "text", None) or "").strip()
            if not label or not text:
                continue

            start_time, end_time = map_entity_to_time(ent.start_char, ent.end_char, batch_spans)
            if start_time is None or end_time is None:
                continue

            all_entities.append(
                {
                    "text": text,
                    "label": label,
                    "start_time": float(start_time),
                    "end_time": float(end_time),
                    "char_start": ent.start_char,
                    "char_end": ent.end_char,
                }
            )
            ner_stats["entities_found"] += 1
    except Exception as exc:
        print(f"      ⚠️  NER error in batch {batch_num}: {exc}")
        ner_stats["errors"] += 1


def _run_dynamic_ner(sections: List[Dict[str, Any]], run_ner: bool) -> tuple[List[Dict[str, Any]], Dict[str, int]]:
    print("\n🏷️  Running NER with dynamic batching...")
    all_entities: List[Dict[str, Any]] = []
    ner_stats = _empty_ner_stats()

    if not run_ner:
        print(f"   ⏭️  NER skipped (run_ner={run_ner})")
        return all_entities, ner_stats

    safe_token_limit = get_safe_token_limit(default_fallback=300)
    print(f"   📏 NER safe token limit: {safe_token_limit}")

    all_paragraphs = _collect_ner_paragraphs(sections, safe_token_limit)
    current_batch: List[Dict[str, Any]] = []
    batch_num = 0

    for para_info in all_paragraphs:
        para_text = words_to_text(para_info["words"])
        estimated_tokens = len(para_text.split()) * 1.3
        current_batch_tokens = sum(len(words_to_text(p["words"]).split()) * 1.3 for p in current_batch)

        if current_batch and (current_batch_tokens + estimated_tokens) > safe_token_limit:
            batch_num += 1
            batch_text = " ".join(words_to_text(p["words"]) for p in current_batch)
            batch_all_words = [w for p in current_batch for w in p["words"]]
            _append_batch_entities(
                batch_text,
                batch_all_words,
                len(current_batch),
                batch_num,
                int(current_batch_tokens),
                all_entities,
                ner_stats,
            )
            current_batch = []

        current_batch.append(para_info)

    if current_batch:
        batch_num += 1
        current_batch_tokens = sum(len(words_to_text(p["words"]).split()) * 1.3 for p in current_batch)
        batch_text = " ".join(words_to_text(p["words"]) for p in current_batch)
        batch_all_words = [w for p in current_batch for w in p["words"]]
        _append_batch_entities(
            batch_text,
            batch_all_words,
            len(current_batch),
            batch_num,
            int(current_batch_tokens),
            all_entities,
            ner_stats,
        )

    print(f"   ✅ Total entities found: {len(all_entities)} across {batch_num} batches")
    return all_entities, ner_stats


def _build_chunk_objects(
    chunk_data_items: List[Dict[str, Any]],
    chunk_vectors: Any,
    testimony_uuid: str,
    story_meta: Dict[str, Any],
    collection_meta: Dict[str, str],
    folder_meta: Dict[str, str],
) -> List[Dict[str, Any]]:
    chunks_objects: List[Dict[str, Any]] = []
    for chunk_data, chunk_vector in zip(chunk_data_items, chunk_vectors):
        chunk_entities = chunk_data["entities"]
        chunk_labels = list(set(ent["label"] for ent in chunk_entities))

        chunks_objects.append(
            {
                "class": "Chunks",
                "properties": {
                    "theirstory_id": testimony_uuid,
                    "chunk_id": int(chunk_data["chunk_id"]),
                    "start_time": chunk_data["start_time"],
                    "end_time": chunk_data["end_time"],
                    "transcription": chunk_data["text"],
                    "interview_title": story_meta["title"] or "",
                    "recording_date": story_meta["record_date"] or "",
                    "interview_duration": story_meta["duration"],
                    "word_timestamps": chunk_data["word_timestamps"],
                    "ner_data": chunk_entities,
                    "ner_labels": chunk_labels,
                    "ner_text": [ent["text"] for ent in chunk_entities],
                    "belongsToTestimony": [{"beacon": f"weaviate://localhost/Testimonies/{testimony_uuid}"}],
                    "section_title": chunk_data["section_title"],
                    "speaker": chunk_data["speaker"],
                    "asset_id": story_meta["asset_id"],
                    "organization_id": story_meta["organization_id"],
                    "project_id": story_meta["project_id"],
                    "section_id": int(chunk_data["section_id"]),
                    "para_id": int(chunk_data["para_id"]),
                    "transcoded": story_meta["transcoded"],
                    "thumbnail_url": story_meta["thumbnail_url"],
                    "date": to_weaviate_date(story_meta["record_date"]),
                    "video_url": story_meta["video_url"],
                    "isAudioFile": story_meta["is_audio_file"],
                    "collection_id": collection_meta["id"],
                    "collection_name": collection_meta["name"],
                    "collection_description": collection_meta["description"],
                    "folder_id": folder_meta["id"],
                    "folder_name": folder_meta["name"],
                    "folder_path": folder_meta["path"],
                },
                "vectors": {
                    "transcription_vector": chunk_vector.tolist() if hasattr(chunk_vector, "tolist") else list(chunk_vector)
                },
            }
        )
    return chunks_objects


@app.post("/process-story")
async def process_story(
    req: ProcessRequest,
    write_to_weaviate: bool = Query(True),
    sentence_chunk_size: int = Query(Config.DEFAULT_SENTENCE_CHUNK_SIZE),
    overlap_sentences: int = Query(Config.DEFAULT_SENTENCE_OVERLAP),
    run_ner: bool = Query(True),
):
    """Process a story with chunking and NER, optionally writing to Weaviate.
    
    Args:
        req: Request containing story payload
        write_to_weaviate: Whether to write results to Weaviate
        sentence_chunk_size: Number of sentences per chunk
        overlap_sentences: Number of sentences to overlap between chunks
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

        collection_meta = _resolve_collection_metadata(payload, req.collection)
        folder_meta = _resolve_folder_metadata(payload, req.folder)
        story_meta = _extract_story_metadata(payload)
        story_id = story_meta["story_id"]
        
        print(f"📌 Story ID: {story_id}")
                    
        if not story_id:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Missing story id. Expected payload.story._id or payload.transcript.storyId"
                },
            )
        
        print(f"📝 Title: {story_meta['title'] or 'No title'}")
        print(f"📅 Date: {story_meta['record_date'] or 'No date'}")
        print(f"🗂️ Collection: {collection_meta['id']} ({collection_meta['name']})")
        if folder_meta["path"]:
            print(f"📁 Folder: {folder_meta['path']}")
        
        # Convert API format to sections
        sections = convert_api_format_to_sections(payload)
        testimony_uuid = convert_to_uuid(f"{collection_meta['uuid_prefix']}:{story_id}")
        testimony_data = _build_testimony_data(sections, testimony_uuid, story_meta, collection_meta, folder_meta)
        speakers = _extract_speakers(sections)
        
        # Parse transcript JSON into the structured spaCy document used by chunking.
        print("\n🧱 BUILDING TRANSCRIPT DOCUMENT...")
        doc = get_transcript_parser().parse_json(testimony_data)
        print(
            f"   ✅ Transcript doc ready with {len(doc._.sections)} sections "
            f"and {len(doc)} tokens"
        )

        # Create Weaviate testimony object
        testimony_obj = _build_testimony_object(
            testimony_uuid,
            testimony_data,
            story_meta,
            collection_meta,
            folder_meta,
            speakers,
        )
        all_entities, ner_stats = _run_dynamic_ner(sections, run_ner)
        
        # STEP 2: Process chunking by sections
        print(
            f"\n🔪 STARTING SENTENCE CHUNKING "
            f"(sentence_chunk_size={sentence_chunk_size}, overlap_sentences={overlap_sentences})..."
        )
        chunk_data_items = chunk_doc_sections(
            doc,
            all_entities,
            sentence_chunk_size,
            overlap_sentences,
        )

        print(f"\n📦 Sentence chunker produced {len(chunk_data_items)} chunks before embedding")

        # Collect ALL chunks first, then batch generate embeddings
        all_chunk_texts = [chunk["text"] for chunk in chunk_data_items]
        
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
                    "Check EMBEDDING_MODEL and HuggingFace connectivity/cache. "
                    f"Current EMBEDDING_MODEL='{Config.EMBEDDING_MODEL}'."
                ) from exc
            print(f"   ✅ Embeddings generated in {time.time() - t_embed:.2f}s")
            
            chunks_objects = _build_chunk_objects(
                chunk_data_items,
                chunk_vectors,
                testimony_uuid,
                story_meta,
                collection_meta,
                folder_meta,
            )
        else:
            chunks_objects = []
        
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
            "counts": {
                "chunks": len(chunks_objects),
                "sections": len(doc._.sections),
            },
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
                "Failed to load/generate embeddings. Check EMBEDDING_MODEL and "
                "HuggingFace cache/connectivity. "
                f"Current EMBEDDING_MODEL='{Config.EMBEDDING_MODEL}'."
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
