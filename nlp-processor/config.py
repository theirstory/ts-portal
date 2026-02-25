"""Configuration management for NLP Processor."""

import json
import os
from pathlib import Path
from typing import List


class Config:
    """Central configuration for the NLP processing service."""
    
    # Weaviate Configuration
    WEAVIATE_HOST_URL = os.getenv("WEAVIATE_HOST_URL", "weaviate")
    WEAVIATE_PORT = os.getenv("WEAVIATE_PORT", "8080")
    WEAVIATE_SECURE = os.getenv("WEAVIATE_SECURE", "false").lower() == "true"
    WEAVIATE_URL = f"{'https' if WEAVIATE_SECURE else 'http'}://{WEAVIATE_HOST_URL}:{WEAVIATE_PORT}"
    
    # Chunking Configuration
    DEFAULT_CHUNK_SECONDS = float(os.getenv("CHUNK_SECONDS", "30"))
    DEFAULT_CHUNK_OVERLAP_SECONDS = float(os.getenv("CHUNK_OVERLAP_SECONDS", "8"))
    MIN_WORDS_PER_CHUNK = int(os.getenv("MIN_WORDS_PER_CHUNK", "10"))
    MIN_CHARS_PER_CHUNK = int(os.getenv("MIN_CHARS_PER_CHUNK", "50"))
    MAX_WORDS_PER_CHUNK = int(os.getenv("MAX_WORDS_PER_CHUNK", "200"))
    
    # Hybrid Chunking Configuration (time + sentence boundaries)
    PREFER_SENTENCE_BREAKS = os.getenv("PREFER_SENTENCE_BREAKS", "true").lower() == "true"
    LOOKAHEAD_SECONDS = float(os.getenv("LOOKAHEAD_SECONDS", "3.0"))
    
    # NER Configuration
    CONFIG_PATH = os.getenv("CONFIG_PATH", "../config.json")
    DEFAULT_NER_LABELS_ENV = os.getenv(
        "NER_LABELS",
        "person,organization,location,date,event,technology",
    )
    DEFAULT_NER_LABELS = [x.strip() for x in DEFAULT_NER_LABELS_ENV.split(",") if x.strip()]
    
    # GLiNER Model Configuration
    GLINER_MODEL = os.getenv("GLINER_MODEL", "urchade/gliner_multi-v2.1")
    GLINER_THRESHOLD = float(os.getenv("GLINER_THRESHOLD", "0.3"))
    GLINER_LOAD_TIMEOUT_SECONDS = int(
        os.getenv("GLINER_LOAD_TIMEOUT_SECONDS", "240")
    )
    MIN_TEXT_LENGTH_FOR_NER = int(os.getenv("MIN_TEXT_LENGTH_FOR_NER", "50"))
    
    # HuggingFace Local Embeddings Configuration
    EMBEDDING_MODEL = os.getenv(
        "EMBEDDING_MODEL",
        "sentence-transformers/LaBSE",
    )
    USE_GPU = os.getenv("USE_GPU", "false").lower() == "true"
    EMBEDDING_LOAD_TIMEOUT_SECONDS = int(
        os.getenv("EMBEDDING_LOAD_TIMEOUT_SECONDS", "180")
    )
    
   
    
    @classmethod
    def load_ner_labels(cls) -> List[str]:
        """Load NER labels from config file or environment variables.
        
        Priority order:
        1. config.json -> ner.labels[].id
        2. Environment variable NER_LABELS (comma-separated)
        
        Returns:
            List of NER label strings
        """
        try:
            config_path = Path(cls.CONFIG_PATH)
            if config_path.exists():
                config_data = json.loads(config_path.read_text(encoding="utf-8"))
                labels = [
                    label["id"]
                    for label in config_data.get("ner", {}).get("labels", [])
                    if isinstance(label, dict) and label.get("id")
                ]
                labels = [str(label).strip() for label in labels if str(label).strip()]
                if labels:
                    print(f"[Config] Loaded {len(labels)} NER labels from {cls.CONFIG_PATH}")
                    return labels
        except Exception as e:
            print(f"[Config] Warning: Could not load NER labels from config file: {e}")
        
        return cls.DEFAULT_NER_LABELS
    
    @classmethod
    def print_config(cls):
        """Print current configuration for debugging."""
        print(f"[Config] GLiNER model: {cls.GLINER_MODEL}")
        print(f"[Config] GLiNER threshold: {cls.GLINER_THRESHOLD}")
        print(f"[Config] GLiNER load timeout (s): {cls.GLINER_LOAD_TIMEOUT_SECONDS}")
        print(f"[Config] Min text length for NER: {cls.MIN_TEXT_LENGTH_FOR_NER}")
        print(f"[Config] Weaviate URL: {cls.WEAVIATE_URL}")
        print(f"[Config] Embedding model: {cls.EMBEDDING_MODEL}")
        print(f"[Config] Use GPU: {cls.USE_GPU}")
        print(f"[Config] Embedding load timeout (s): {cls.EMBEDDING_LOAD_TIMEOUT_SECONDS}")


# Initialize NER labels on module import
NER_LABELS = Config.load_ner_labels()
print(f"[Config] Using {len(NER_LABELS)} NER labels: {NER_LABELS}")
