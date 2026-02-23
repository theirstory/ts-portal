"""Data transformation utilities for API format conversion."""

from typing import Any, Dict, List


def convert_api_format_to_sections(parsed_api_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert API format to internal sections structure.
    
    Transforms the incoming API payload into a structured format with sections,
    paragraphs, and words. Handles both indexed and non-indexed transcripts.
    
    Args:
        parsed_api_data: Raw API payload with transcript and story data
        
    Returns:
        List of section dictionaries with nested paragraphs and words
    """
    transcript_data = parsed_api_data.get("transcript", {})
    story_data = parsed_api_data.get("story", {})
    indexes = story_data.get("indexes")
    
    # If no indexes, create a single section with all paragraphs
    if not indexes:
        print("[Transform] No indexes found, creating single section with all paragraphs")
        return _create_single_section(transcript_data)
    
    # Use the most recent index
    most_recent_index = max(indexes, key=lambda x: x.get("updated_at", ""))
    print(f"[Transform] Using index: {most_recent_index['title']}")
    print(f"[Transform] Last updated: {most_recent_index['updated_at']}")
    
    return _create_indexed_sections(transcript_data, most_recent_index)


def _create_single_section(transcript_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Create a single section containing all paragraphs.
    
    Used when no index information is available.
    
    Args:
        transcript_data: Transcript data with paragraphs and words
        
    Returns:
        List with single section dictionary
    """
    words = transcript_data.get("words", [])
    section = {
        "timestamp": "00:00:00",
        "title": "Complete Transcript",
        "synopsis": "",
        "speaker": "Unknown",
        "start": 0,
        "end": words[-1].get("end", 0) if words else 0,
        "paragraphs": []
    }
    
    # Add all paragraphs with word indices
    for para_idx, para in enumerate(transcript_data.get("paragraphs", [])):
        para_start = para.get("start", 0)
        para_end = para.get("end", 0)
        raw_para_words = para.get("words") or []
        
        # Some transcripts provide global transcript.words but paragraph.words is null/empty.
        if raw_para_words:
            source_words = raw_para_words
        else:
            source_words = [
                word for word in words
                if para_start <= float(word.get("start", 0) or 0) <= para_end
            ]
        
        para_words = []
        for word_idx, word in enumerate(source_words):
            word_copy = word.copy()
            word_copy["section_idx"] = 0
            word_copy["para_idx"] = para_idx
            word_copy["word_idx"] = word_idx
            para_words.append(word_copy)
        
        section_para = {
            "speaker": para.get("speaker", "Unknown"),
            "start": para_start,
            "end": para_end,
            "words": para_words,
            "ner": []
        }
        section["paragraphs"].append(section_para)
    
    # Determine most common speaker
    if section["paragraphs"]:
        speakers = [p.get("speaker", "Unknown") for p in section["paragraphs"]]
        section["speaker"] = max(set(speakers), key=speakers.count) if speakers else "Unknown"
    
    print(f"[Transform] Created single section with {len(section['paragraphs'])} paragraphs")
    return [section]


def _create_indexed_sections(
    transcript_data: Dict[str, Any],
    index: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """Create sections based on index metadata.
    
    Args:
        transcript_data: Transcript data with paragraphs and words
        index: Index metadata with section information
        
    Returns:
        List of section dictionaries
    """
    sections = []
    all_words = transcript_data.get("words", [])
    all_paragraphs = transcript_data.get("paragraphs", [])
    section_metas = _prepare_section_metadata(index.get("metadata", []), all_words)
    
    for section_idx, section_meta in enumerate(section_metas):
        section = {
            "timestamp": section_meta.get("timecode", "00:00:00"),
            "title": section_meta.get("title", f"Section {section_meta.get('index', 0)}"),
            "synopsis": section_meta.get("synopsis", ""),
            "speaker": "Unknown",
            "start": _section_start(section_meta),
            "end": section_meta.get("time", {}).get("end"),
            "paragraphs": []
        }
        
        section_start = section["start"]
        
        # Calculate section end time if not provided
        if section["end"] is None or section["end"] <= section_start:
            section["end"] = _calculate_section_end(
                section_idx,
                section_metas,
                all_words
            )
        
        print(f"[Transform] Section time range: {section_start}s - {section['end']}s")
        
        # Find paragraphs within this section's time range
        para_idx = 0
        for para in all_paragraphs:
            para_start = para.get("start", 0)
            para_end = para.get("end", 0)
            
            # Check if paragraph overlaps with this section
            if para_start < section["end"] and para_end > section_start:
                para_words = _extract_section_words(
                    all_words,
                    para_start,
                    para_end,
                    section_start,
                    section["end"],
                    section_idx,
                    para_idx
                )
                
                if para_words:
                    section_para_start = max(para_start, section_start)
                    section_para_end = min(para_end, section["end"])
                    
                    section_para = {
                        "speaker": para.get("speaker", "Unknown"),
                        "start": section_para_start,
                        "end": section_para_end,
                        "words": para_words,
                        "ner": []
                    }
                    
                    section["paragraphs"].append(section_para)
                    para_idx += 1
        
        # Update section speaker based on most common speaker in paragraphs
        if section["paragraphs"]:
            speakers = [p.get("speaker", "Unknown") for p in section["paragraphs"]]
            section["speaker"] = max(set(speakers), key=speakers.count) if speakers else "Unknown"
            
            # Update section start/end to actual word boundaries
            section["start"] = section["paragraphs"][0]["words"][0]["start"]
            section["end"] = section["paragraphs"][-1]["words"][-1]["end"]
        
        sections.append(section)
    
    print(f"[Transform] Created {len(sections)} sections from index")
    return sections


def _section_start(section_meta: Dict[str, Any]) -> float:
    """Read section start time with a safe default."""
    return float(section_meta.get("time", {}).get("start", 0) or 0)


def _prepare_section_metadata(
    metadata: List[Dict[str, Any]],
    all_words: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Sort metadata and auto-generate an initial section when needed."""
    if not metadata:
        return []
    
    sorted_metadata = sorted(metadata, key=_section_start)
    first_section_start = _section_start(sorted_metadata[0])
    earliest_word_start = float(all_words[0].get("start", 0) or 0) if all_words else 0
    
    # Add an explicit first section when transcript words start before first index section.
    if earliest_word_start < first_section_start:
        auto_section = {
            "title": "First Section (auto-generated)",
            "timecode": "00:00:00",
            "time": {
                "start": 0,
                "end": first_section_start
            },
            "synopsis": "",
            "notes": "",
            "keywords": "",
            "lines": []
        }
        sorted_metadata = [auto_section] + sorted_metadata
        print(
            "[Transform] Added auto-generated first section: "
            f"0s - {first_section_start}s"
        )
    
    return sorted_metadata


def _calculate_section_end(
    section_position: int,
    all_section_metas: List[Dict[str, Any]],
    all_words: List[Dict[str, Any]]
) -> float:
    """Calculate section end time when not explicitly provided.
    
    Args:
        section_position: Current section position in metadata list
        all_section_metas: All section metadata entries
        all_words: All transcript words
        
    Returns:
        Calculated end time in seconds
    """
    current_start = _section_start(all_section_metas[section_position])
    
    # Find the next section with a strictly greater start.
    for next_position in range(section_position + 1, len(all_section_metas)):
        next_start = _section_start(all_section_metas[next_position])
        if next_start > current_start:
            return next_start
    
    # Use last word's end time as transcript end.
    if all_words:
        return all_words[-1].get("end", 0)
    
    return current_start


def _extract_section_words(
    all_words: List[Dict[str, Any]],
    para_start: float,
    para_end: float,
    section_start: float,
    section_end: float,
    section_idx: int,
    para_idx: int
) -> List[Dict[str, Any]]:
    """Extract words that belong to both a paragraph and a section.
    
    Args:
        all_words: All transcript words
        para_start: Paragraph start time
        para_end: Paragraph end time
        section_start: Section start time
        section_end: Section end time
        section_idx: Section index
        para_idx: Paragraph index within section
        
    Returns:
        List of word dictionaries with indices added
    """
    para_words = []
    word_idx = 0
    section_floor = float(int(section_start))
    
    for word in all_words:
        word_start = word.get("start", 0)
        
        # Check if word is within paragraph bounds
        if not (para_start <= word_start <= para_end):
            continue
        
        # Check if word is within section bounds
        if section_start == 0:  # First section
            if word_start >= section_end:
                continue
        else:  # Other sections
            if word_start < section_floor or word_start >= section_end:
                continue
        
        word_copy = word.copy()
        word_copy["section_idx"] = section_idx
        word_copy["para_idx"] = para_idx
        word_copy["word_idx"] = word_idx
        para_words.append(word_copy)
        word_idx += 1
    
    return para_words
