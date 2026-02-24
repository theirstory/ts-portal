"""Named Entity Recognition (NER) processing using GLiNER and spaCy."""

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import logging
import time
from typing import Any, Dict, List, Literal, Optional, Tuple
import warnings

import spacy
from gliner import GLiNER
from spacy.language import Language

from config import Config, NER_LABELS

logger = logging.getLogger(__name__)

# Reduce noisy HuggingFace warnings in normal operation logs.
warnings.filterwarnings(
    "ignore",
    message=r"The `resume_download` argument is deprecated.*",
    category=UserWarning,
)

# Initialize spaCy model
nlp = spacy.blank("en")
gliner_model: Optional[GLiNER] = None


def get_gliner_model() -> GLiNER:
    """Lazily load GLiNER model on first real NER use."""
    global gliner_model
    if gliner_model is None:
        timeout = max(1, int(Config.GLINER_LOAD_TIMEOUT_SECONDS))
        started_at = time.time()
        logger.info(
            "[NER] Loading GLiNER model '%s' (timeout=%ss). This may take several minutes on first run.",
            Config.GLINER_MODEL,
            timeout,
        )
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(GLiNER.from_pretrained, Config.GLINER_MODEL)
        try:
            poll_seconds = 10
            while True:
                elapsed = time.time() - started_at
                remaining = timeout - elapsed
                if remaining <= 0:
                    raise FutureTimeoutError()

                try:
                    gliner_model = future.result(timeout=min(poll_seconds, remaining))
                    break
                except FutureTimeoutError:
                    logger.info(
                        "[NER] Still loading GLiNER model '%s'... %.0fs elapsed",
                        Config.GLINER_MODEL,
                        time.time() - started_at,
                    )
        except FutureTimeoutError as exc:
            message = (
                "[NER] Timeout loading GLiNER model "
                f"'{Config.GLINER_MODEL}' after {timeout}s. "
                "Verify internet/cache, increase GLINER_LOAD_TIMEOUT_SECONDS, "
                "or import with run_ner=false."
            )
            logger.error(message)
            raise RuntimeError(message) from exc
        except Exception as exc:
            message = (
                "[NER] Failed to load GLiNER model "
                f"'{Config.GLINER_MODEL}': {exc}"
            )
            logger.exception(message)
            raise RuntimeError(message) from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

        logger.info("[NER] GLiNER model ready in %.2fs", time.time() - started_at)
    return gliner_model

NerEmptyReason = Literal["ok", "too_short", "gliner_bug_empty", "no_entities"]


@Language.component("gliner_custom")
def gliner_custom_component(doc):
    """Custom spaCy pipeline component for GLiNER entity extraction.
    
    Args:
        doc: spaCy Doc object
        
    Returns:
        Doc with entities populated
    """
    text = (doc.text or "").strip()
    
    if len(text) < 5 or not NER_LABELS:
        doc.ents = ()
        return doc
    
    try:
        model = get_gliner_model()
        ents = model.predict_entities(
            text=text,
            labels=NER_LABELS,
            threshold=Config.GLINER_THRESHOLD,
        )
    except IndexError:
        doc.ents = ()
        return doc
    
    spans = []
    for entity in ents:
        label = (entity.get("label") or "").strip()
        ent_text = (entity.get("text") or "").strip()
        if not label or not ent_text:
            continue
        
        # Try using offsets returned by GLiNER
        start_char = entity.get("start")
        end_char = entity.get("end")
        
        span = None
        if start_char is not None and end_char is not None:
            try:
                span = doc.char_span(
                    int(start_char),
                    int(end_char),
                    label=label,
                    alignment_mode="contract",
                )
            except Exception:
                span = None
        
        # Fallback: search for text in string if char_span fails
        if span is None:
            idx = text.find(ent_text)
            if idx != -1:
                span = doc.char_span(
                    idx,
                    idx + len(ent_text),
                    label=label,
                    alignment_mode="contract",
                )
        
        if span is not None and (span.text or "").strip():
            spans.append(span)
    
    doc.ents = spacy.util.filter_spans(spans)
    return doc


def ensure_ner_pipe():
    """Ensure the GLiNER custom pipeline component is loaded."""
    if "gliner_custom" not in nlp.pipe_names:
        logger.info("[NER] Adding gliner_custom spaCy pipe (model=%s)", Config.GLINER_MODEL)
        nlp.add_pipe("gliner_custom", last=True)
        logger.info("[NER] Active pipes: %s", nlp.pipe_names)


def get_safe_token_limit(default_fallback: int = 300) -> int:
    """Return a conservative token limit based on model configuration."""
    try:
        model = get_gliner_model()
        max_tokens = int(getattr(model.config, "max_length", 384))
        return max(1, int(max_tokens * 0.8))
    except Exception as exc:
        logger.warning("[NER] Could not determine model token limit: %s", exc)
        return default_fallback


def safe_ner_process(
    text: str, 
    min_length: int = Config.MIN_TEXT_LENGTH_FOR_NER
) -> Tuple[List[Any], NerEmptyReason]:
    """Process text for NER with error handling.
    
    Args:
        text: Text to process
        min_length: Minimum text length required for processing
        
    Returns:
        Tuple of (entities list, reason for empty result)
    """
    t = (text or "").strip()
    if len(t) < min_length:
        return [], "too_short"
    
    ensure_ner_pipe()
    
    try:
        doc = nlp(t)
                
        # Primary method: doc.ents
        ents = list(doc.ents) if doc.ents else []
        if ents:
            return ents, "ok"
        
        # Fallback: doc.spans (in case pipeline uses spans)
        spans_as_ents: List[Any] = []
        for _, spans in doc.spans.items():
            if not spans:
                continue
            for span in spans:
                if getattr(span, "label_", None) and (span.text or "").strip():
                    spans_as_ents.append(span)
        
        if spans_as_ents:
            return spans_as_ents, "ok"
        
        return [], "no_entities"
    
    except IndexError:
        return [], "gliner_bug_empty"


def build_word_char_spans(words: List[Dict[str, Any]]) -> List[Tuple[int, int, Dict[str, Any]]]:
    """Build character-level spans for words in chunk text.
    
    Generates (char_start, char_end, word_obj) tuples for text created by
    joining words with spaces.
    
    Args:
        words: List of word dictionaries
        
    Returns:
        List of (start_idx, end_idx, word_dict) tuples
    """
    spans: List[Tuple[int, int, Dict[str, Any]]] = []
    pos = 0
    first = True
    
    for word in words:
        token = (word.get("text") or "") if isinstance(word, dict) else ""
        if not token:
            continue
        
        if not first:
            pos += 1  # Space between words
        first = False
        
        start = pos
        pos += len(token)
        end = pos
        spans.append((start, end, word))
    
    return spans


def map_entity_to_time(
    ent_start: int,
    ent_end: int,
    word_spans: List[Tuple[int, int, Dict[str, Any]]],
) -> Tuple[Optional[float], Optional[float]]:
    """Map entity character positions to time range based on word spans.
    
    Args:
        ent_start: Entity start character position
        ent_end: Entity end character position
        word_spans: List of (char_start, char_end, word) tuples
        
    Returns:
        Tuple of (start_time, end_time) or (None, None) if not found
    """
    touched: List[Dict[str, Any]] = []
    for word_start, word_end, word in word_spans:
        if word_end <= ent_start:
            continue
        if word_start >= ent_end:
            break
        touched.append(word)
    
    if not touched:
        return None, None
    
    try:
        start_time = float(touched[0]["start"])
        end_time = float(touched[-1]["end"])
        return start_time, end_time
    except Exception:
        return None, None
