"""Sentence-based chunking utilities built on top of parsed transcript documents."""

from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

from spacy.tokens import Span, Token

from config import Config
from spacy_models import get_en_sentence_nlp
from utils import normalize_text


Entity = Dict[str, Any]


def _build_token_char_spans(tokens: Sequence[Token]) -> List[Tuple[int, int, Token]]:
    spans: List[Tuple[int, int, Token]] = []
    pos = 0

    for idx, token in enumerate(tokens):
        if idx > 0:
            pos += 1
        start = pos
        pos += len(token.text)
        end = pos
        spans.append((start, end, token))

    return spans


def _tokens_for_char_range(
    token_spans: Sequence[Tuple[int, int, Token]],
    start_char: int,
    end_char: int,
) -> List[Token]:
    selected: List[Token] = []

    for token_start, token_end, token in token_spans:
        if token_end <= start_char:
            continue
        if token_start >= end_char:
            break
        selected.append(token)

    return selected


def _entity_overlaps_chunk(entity: Entity, start_time: float, end_time: float) -> bool:
    ent_start = entity.get("start_time")
    ent_end = entity.get("end_time")
    if ent_start is None or ent_end is None:
        return False
    return float(ent_start) < end_time and float(ent_end) > start_time


def _chunk_sentences(sentences: Sequence[Span], chunk_size: int, overlap_size: int) -> List[Tuple[int, int]]:
    if not sentences:
        return []

    if len(sentences) <= chunk_size:
        return [(0, len(sentences))]

    chunk_size = max(2, int(chunk_size))
    overlap_size = max(0, min(int(overlap_size), chunk_size - 1))
    step = max(1, chunk_size - overlap_size)

    chunks: List[Tuple[int, int]] = []
    i = 0
    total = len(sentences)

    while i < total:
        if i + chunk_size > total and i > 0:
            start_idx = max(total - chunk_size, 0)
            final_chunk = (start_idx, total)
            if not chunks or chunks[-1] != final_chunk:
                chunks.append(final_chunk)
            break

        end_idx = min(i + chunk_size, total)
        chunks.append((i, end_idx))
        if end_idx >= total:
            break
        i += step

    return chunks


def chunk_doc_sections(
    doc,
    entities: Sequence[Entity],
    sentence_chunk_size: int,
    overlap_sentences: int,
) -> List[Dict[str, Any]]:
    """Chunk parsed sections and paragraphs by sentence windows with overlap."""
    sentence_nlp = get_en_sentence_nlp()
    chunks: List[Dict[str, Any]] = []
    global_chunk_id = 0

    for section_idx, section in enumerate(doc._.sections):
        section_title = section._.title or f"Section {section_idx + 1}"
        print(f"\n  📂 Section {section_idx + 1}/{len(doc._.sections)}: {section_title}")

        for para_idx, paragraph in enumerate(section._.paragraphs):
            print(f"     └─ Processing paragraph {para_idx + 1}...")
            para_text = normalize_text(paragraph.text)
            if not para_text:
                print("        ↳ Skipped empty paragraph")
                continue

            para_doc = sentence_nlp(para_text)
            sentences = list(para_doc.sents)
            if not sentences:
                print("        ↳ No sentence boundaries detected, skipping paragraph")
                continue

            paragraph_tokens = list(paragraph)
            token_spans = _build_token_char_spans(paragraph_tokens)
            sentence_windows = _chunk_sentences(
                sentences,
                sentence_chunk_size,
                overlap_sentences,
            )

            print(
                f"        ↳ {len(sentences)} sentences -> {len(sentence_windows)} chunks "
                f"(size={sentence_chunk_size}, overlap={overlap_sentences})"
            )

            for window_start, window_end in sentence_windows:
                chunk_start_char = sentences[window_start].start_char
                chunk_end_char = sentences[window_end - 1].end_char
                chunk_tokens = _tokens_for_char_range(token_spans, chunk_start_char, chunk_end_char)
                if not chunk_tokens:
                    continue

                chunk_text = normalize_text(" ".join(token.text for token in chunk_tokens))
                if not chunk_text or len(chunk_text) < Config.MIN_CHARS_PER_CHUNK:
                    continue

                if len(chunk_tokens) < Config.MIN_WORDS_PER_CHUNK:
                    continue

                start_time = float(chunk_tokens[0]._.start_time)
                end_time = float(chunk_tokens[-1]._.end_time)

                word_timestamps = [
                    {
                        "text": token.text,
                        "start": float(token._.start_time),
                        "end": float(token._.end_time),
                    }
                    for token in chunk_tokens
                ]

                chunk_entities = [
                    {
                        "text": entity["text"],
                        "label": entity["label"],
                        "start_time": float(entity["start_time"]),
                        "end_time": float(entity["end_time"]),
                    }
                    for entity in entities
                    if _entity_overlaps_chunk(entity, start_time, end_time)
                ]

                chunks.append(
                    {
                        "chunk_id": global_chunk_id,
                        "section_id": section_idx,
                        "para_id": para_idx,
                        "section_title": section_title,
                        "speaker": paragraph._.speaker or "Unknown",
                        "start_time": start_time,
                        "end_time": end_time,
                        "text": chunk_text,
                        "word_timestamps": word_timestamps,
                        "entities": chunk_entities,
                    }
                )
                global_chunk_id += 1

    return chunks
