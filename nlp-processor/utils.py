"""Utility functions for NLP processing."""

import re
import uuid
from typing import Any, Dict, List, Optional


def convert_to_uuid(raw_id: str) -> str:
    """Convert an arbitrary ID into a stable UUID string.

    Strategy:
    1. If input is already a UUID -> normalize and return.
    2. If input is hex-like -> pad/truncate to 32 hex chars and return UUID.
    3. Otherwise -> generate deterministic UUIDv5 from the raw input.
    """
    s = (raw_id or "").strip()

    # 1) Already a UUID
    try:
        return str(uuid.UUID(s))
    except Exception:
        pass

    # 2) Hex-like IDs (e.g., Mongo ObjectId)
    compact = s.replace("-", "")
    if compact and re.fullmatch(r"[0-9a-fA-F]+", compact):
        padded = compact.ljust(32, "0")[:32]
        return str(uuid.UUID(hex=padded))

    # 3) Arbitrary string IDs -> deterministic UUID
    return str(uuid.uuid5(uuid.NAMESPACE_URL, s or "default"))


def safe_get(d: Dict[str, Any], path: List[str], default=None):
    """Safely navigate nested dictionary keys.
    
    Args:
        d: Dictionary to navigate
        path: List of keys to traverse
        default: Value to return if path doesn't exist
        
    Returns:
        Value at the path or default
    """
    current: Any = d
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def normalize_text(text: str) -> str:
    """Normalize whitespace in text.
    
    Replaces multiple whitespace characters with a single space
    and strips leading/trailing whitespace.
    
    Args:
        text: Text to normalize
        
    Returns:
        Normalized text string
    """
    return re.sub(r"\s+", " ", (text or "").strip())


def words_to_text(words: List[Dict[str, Any]]) -> str:
    """Convert a list of word objects to a normalized text string.
    
    Args:
        words: List of word dictionaries with 'text' field
        
    Returns:
        Concatenated and normalized text
    """
    parts = [w.get("text", "") for w in words if isinstance(w, dict) and w.get("text")]
    return normalize_text(" ".join(parts))


def to_weaviate_date(value: Any) -> Optional[str]:
    """Convert various date formats to Weaviate-compatible RFC3339 format.
    
    Args:
        value: Date value (string or other type)
        
    Returns:
        RFC3339 formatted date string or None
    """
    if not value:
        return None
    
    if isinstance(value, str):
        s = value.strip()
        # Handle YYYY-MM-DD format
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            return s + "T00:00:00Z"
        # Handle ISO format with 'T'
        if "T" in s:
            return s.replace(" ", "T")
        return None
    
    return None
