"""Sentence-based text chunking using spaCy sentence segmentation.

Words (with timestamps) are segmented into sentences via spaCy's senter,
then sentences are greedily grouped into chunks that respect min/max word
limits without ever breaking mid-sentence.
"""

import logging
from typing import Any, Dict, List, Optional

import spacy
from spacy.language import Language

logger = logging.getLogger(__name__)

_nlp: Optional[Language] = None


def _get_nlp() -> Language:
    """Lazy-load a spaCy English pipeline with only sentence segmentation."""
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm", exclude=["ner", "lemmatizer", "attribute_ruler"])
        except OSError:
            logger.warning("en_core_web_sm not found, falling back to rule-based sentencizer")
            _nlp = spacy.blank("en")
            _nlp.add_pipe("sentencizer")
    return _nlp


def _words_to_sentences(
    words: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """Segment a flat word list into sentences using spaCy.

    Reconstructs running text from word dicts, runs sentence detection, then
    maps sentence character spans back to the original word objects via the
    character offsets we tracked during reconstruction.
    """
    if not words:
        return []

    nlp = _get_nlp()

    text_parts: List[str] = []
    # char offset where each word begins in the joined string
    word_char_starts: List[int] = []
    offset = 0
    for w in words:
        wt = w.get("text", "")
        word_char_starts.append(offset)
        text_parts.append(wt)
        offset += len(wt) + 1  # +1 for the joining space

    text = " ".join(text_parts)
    doc = nlp(text)

    sentences: List[List[Dict[str, Any]]] = []
    for sent in doc.sents:
        s_start = sent.start_char
        s_end = sent.end_char
        sent_words = [
            words[i]
            for i in range(len(words))
            if word_char_starts[i] >= s_start and word_char_starts[i] < s_end
        ]
        if sent_words:
            sentences.append(sent_words)

    # Safety: if rounding / whitespace caused any trailing words to be missed,
    # attach them to the last sentence.
    accounted = sum(len(s) for s in sentences)
    if accounted < len(words):
        remainder = words[accounted:]
        if sentences:
            sentences[-1].extend(remainder)
        else:
            sentences.append(remainder)

    return sentences


def chunk_words_by_sentences(
    words: List[Dict[str, Any]],
    min_words: int = 40,
    max_words: int = 200,
    overlap_sentences: int = 1,
) -> List[List[Dict[str, Any]]]:
    """Group words into chunks of whole sentences within word-count limits.

    Algorithm
    ---------
    1. Segment *words* into sentences via spaCy's senter / sentencizer.
    2. Greedily accumulate sentences until adding the next one would exceed
       *max_words*.  Flush the current chunk and start a new one.
    3. A single sentence longer than *max_words* becomes its own chunk
       (we never split a sentence).
    4. After all sentences are assigned, merge the final chunk into the
       previous one if it is shorter than *min_words*.
    5. Optionally repeat the last *overlap_sentences* of the previous chunk
       at the start of the next chunk for context continuity.

    Timestamps are **not** used for grouping — they ride along on the word
    dicts and are consumed downstream to set chunk start/end times.

    Parameters
    ----------
    words : list of word dicts, each with ``text``, ``start``, ``end``
    min_words : soft lower bound; undersized trailing chunks are merged back
    max_words : hard upper bound (except for single overlong sentences)
    overlap_sentences : how many sentences from the end of the previous chunk
        to repeat at the start of the next chunk (0 = no overlap)

    Returns
    -------
    List of word-lists (chunks).  Each word-list preserves the original
    word dicts (and therefore their timestamps).
    """
    if not words:
        return []

    clean = [
        w for w in words
        if isinstance(w, dict) and "start" in w and "end" in w and w.get("text")
    ]
    if not clean:
        return []

    sentences = _words_to_sentences(clean)
    if not sentences:
        return [clean]

    chunks: List[List[List[Dict[str, Any]]]] = []  # list of sentence-groups
    current: List[List[Dict[str, Any]]] = []
    current_wc = 0

    for sent in sentences:
        sent_len = len(sent)

        if current_wc > 0 and current_wc + sent_len > max_words:
            chunks.append(current)

            if overlap_sentences > 0 and len(current) > overlap_sentences:
                overlap = current[-overlap_sentences:]
                current = list(overlap)
                current_wc = sum(len(s) for s in current)
            else:
                current = []
                current_wc = 0

        current.append(sent)
        current_wc += sent_len

    if current:
        chunks.append(current)

    # Merge undersized trailing chunk back into the previous one
    if len(chunks) > 1:
        last_wc = sum(len(s) for s in chunks[-1])
        if last_wc < min_words:
            chunks[-2].extend(chunks[-1])
            chunks.pop()

    # Flatten sentence-groups into flat word lists
    result: List[List[Dict[str, Any]]] = []
    for chunk_sents in chunks:
        flat = [w for sent in chunk_sents for w in sent]
        if flat:
            result.append(flat)

    return result
