"""Text chunking utilities for time-based segmentation."""

import re
from typing import Any, Dict, List


def is_sentence_end(word_text: str) -> bool:
    """Check if a word represents the end of a sentence.
    
    Detects sentence boundaries by looking for common sentence-ending patterns:
    - Words ending with: . ! ? ... ; )
    - Common abbreviations are excluded (e.g., Dr., Mr., etc.)
    - Ellipsis patterns (...)
    
    Args:
        word_text: The text content of the word
        
    Returns:
        True if the word likely ends a sentence
    """
    if not word_text:
        return False
    
    text = word_text.strip()
    if not text:
        return False
    
    # Common abbreviations that shouldn't be treated as sentence endings
    abbreviations = {
        "dr.", "mr.", "mrs.", "ms.", "sr.", "jr.", "etc.", "vs.", "inc.",
        "ltd.", "co.", "corp.", "dept.", "est.", "fig.", "no.", "vol.",
        "dra.", "sra.", "srta.",  # Spanish
        "p.m.", "a.m.", "e.g.", "i.e.",
    }
    
    text_lower = text.lower()
    if text_lower in abbreviations:
        return False
    
    # Check for sentence-ending punctuation
    # Patterns: ends with . ! ? ... or combinations like ." !) etc.
    sentence_end_pattern = re.compile(
        r'[.!?;]+["\')]*$|\.\.\.+$'
    )
    
    return bool(sentence_end_pattern.search(text))


def chunk_words_by_time(
    words: List[Dict[str, Any]],
    chunk_seconds: float,
    overlap_seconds: float,
    min_words: int = 10,
    max_words: int = 200,
    prefer_sentence_breaks: bool = True,
    lookahead_seconds: float = 3.0,
) -> List[List[Dict[str, Any]]]:
    """Chunk words by time window with sentence-aware boundaries (hybrid chunking).
    
    Creates chunks based on word timing information, ensuring each chunk
    spans approximately chunk_seconds. When prefer_sentence_breaks=True,
    the algorithm will look ahead up to lookahead_seconds to find a natural
    sentence boundary, creating more coherent chunks for search and RAG.
    
    Hybrid Algorithm:
    1. Start with temporal base: find words within chunk_seconds window
    2. If prefer_sentence_breaks=True: extend up to lookahead_seconds looking for sentence end
    3. If no sentence end found or max_words exceeded: cut at temporal boundary
    4. Apply min_words merging to avoid tiny chunks
    
    Args:
        words: List of word dictionaries with 'start' and 'end' timestamps
        chunk_seconds: Target duration for each chunk in seconds (temporal base)
        overlap_seconds: Number of seconds to overlap with previous chunk
        min_words: Minimum number of words per chunk (smaller chunks get merged)
        max_words: Maximum number of words per chunk (prevents oversized chunks)
        prefer_sentence_breaks: If True, extend chunks to sentence boundaries when possible
        lookahead_seconds: Additional seconds to look ahead for sentence endings
        
    Returns:
        List of word lists (chunks)
    """
    if not words:
        return []
    
    # Filter valid words with timing information
    clean: List[Dict[str, Any]] = []
    for word in words:
        if not isinstance(word, dict):
            continue
        if "start" not in word or "end" not in word:
            continue
        try:
            _ = float(word["start"])
            _ = float(word["end"])
        except Exception:
            continue
        clean.append(word)
    
    if not clean:
        return []
    
    chunks: List[List[Dict[str, Any]]] = []
    i = 0
    n = len(clean)
    
    # Ensure valid parameters
    chunk_seconds = max(0.1, float(chunk_seconds))
    overlap_seconds = max(0.0, float(overlap_seconds))
    overlap_seconds = min(overlap_seconds, chunk_seconds * 0.8)
    
    while i < n:
        start_time = float(clean[i]["start"])
        end_limit = start_time + chunk_seconds
        
        # STEP 1: Find temporal base - all words within chunk_seconds window
        j = i
        while j < n and float(clean[j]["end"]) <= end_limit:
            j += 1
        
        # Ensure progress even if no words fit exactly
        if j == i:
            j = min(i + 1, n)
        
        # STEP 2: Hybrid extension - look ahead for sentence boundaries
        if prefer_sentence_breaks and j < n:
            extended_limit = start_time + chunk_seconds + lookahead_seconds
            
            # Look for sentence boundaries within lookahead window
            best_sentence_end = j
            k = j
            while k < n and float(clean[k]["end"]) <= extended_limit:
                word_text = clean[k].get("text", "")
                if is_sentence_end(word_text):
                    best_sentence_end = k + 1  # Include the sentence-ending word
                    break
                k += 1
            
            # Only extend if we found a sentence end and don't exceed max_words
            if best_sentence_end > j:
                potential_chunk_size = best_sentence_end - i
                if potential_chunk_size <= max_words:
                    j = best_sentence_end
        
        # STEP 3: Enforce max_words limit
        if (j - i) > max_words:
            j = i + max_words
        
        chunk = clean[i:j]
        chunks.append(chunk)
        
        # Handle overlap for next chunk
        if overlap_seconds <= 0:
            i = j
            continue
        
        end_time = float(chunk[-1]["end"])
        next_start_time = end_time - overlap_seconds
        
        # Find the starting index for the next chunk (with overlap)
        k = i
        while k < n and float(clean[k]["start"]) < next_start_time:
            k += 1
        
        # Ensure progress while maintaining overlap if possible
        if k < j:
            i = max(k, i + 1)
        else:
            i = j
    
    # Merge chunks that are too small with the previous chunk
    if min_words > 0:
        merged_chunks: List[List[Dict[str, Any]]] = []
        for chunk in chunks:
            if len(chunk) < min_words and merged_chunks:
                # Merge with previous chunk
                merged_chunks[-1].extend(chunk)
            else:
                merged_chunks.append(chunk)
        return merged_chunks
    
    return chunks
