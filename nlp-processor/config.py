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
    MIN_WORDS_PER_CHUNK = int(os.getenv("MIN_WORDS_PER_CHUNK", "10"))
    MIN_CHARS_PER_CHUNK = int(os.getenv("MIN_CHARS_PER_CHUNK", "50"))
    MAX_WORDS_PER_CHUNK = int(os.getenv("MAX_WORDS_PER_CHUNK", "200"))

    # Sentence-based chunking configuration
    DEFAULT_SENTENCE_CHUNK_SIZE = int(os.getenv("SENTENCE_CHUNK_SIZE", "10"))
    DEFAULT_SENTENCE_OVERLAP = int(os.getenv("SENTENCE_OVERLAP", "5"))
    
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
        os.getenv("GLINER_LOAD_TIMEOUT_SECONDS", "500")
    )
    MIN_TEXT_LENGTH_FOR_NER = int(os.getenv("MIN_TEXT_LENGTH_FOR_NER", "50"))
    
    # HuggingFace Local Embeddings Configuration
    # Qwen3-VL-Embedding puts text and images in one shared space, which is what makes
    # unified search across recordings, documents, and images possible. Swap this for a
    # text-only model (e.g. sentence-transformers/LaBSE) to fall back to text-only search.
    EMBEDDING_MODEL = os.getenv(
        "EMBEDDING_MODEL",
        "Qwen/Qwen3-VL-Embedding-2B",
    )
    USE_GPU = os.getenv("USE_GPU", "false").lower() == "true"
    # Overrides device selection entirely ("cuda", "mps", "cpu"). Empty means auto-detect.
    EMBEDDING_DEVICE = os.getenv("EMBEDDING_DEVICE", "")
    EMBEDDING_LOAD_TIMEOUT_SECONDS = int(
        os.getenv("EMBEDDING_LOAD_TIMEOUT_SECONDS", "600")
    )
    # Matryoshka truncation. 0 keeps the model's native width (2048 for Qwen3-VL-Embedding).
    # Changing this changes the vector width, so it requires recreating Weaviate collections.
    EMBEDDING_TRUNCATE_DIM = int(os.getenv("EMBEDDING_TRUNCATE_DIM", "0"))
    # Page images cost roughly an order of magnitude more than text per item, so they get
    # their own (much smaller) batch size.
    EMBEDDING_IMAGE_BATCH_SIZE = int(os.getenv("EMBEDDING_IMAGE_BATCH_SIZE", "2"))
    # Cap an image's long edge before encoding, to bound peak memory on large scans.
    EMBEDDING_IMAGE_MAX_EDGE = int(os.getenv("EMBEDDING_IMAGE_MAX_EDGE", "1600"))
    
   
    
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
        print(f"[Config] Embedding device override: {cls.EMBEDDING_DEVICE or '(auto)'}")
        print(f"[Config] Embedding truncate dim: {cls.EMBEDDING_TRUNCATE_DIM or '(native)'}")
        print(f"[Config] Embedding image batch size: {cls.EMBEDDING_IMAGE_BATCH_SIZE}")
        print(f"[Config] Embedding image max edge: {cls.EMBEDDING_IMAGE_MAX_EDGE}")
        print(f"[Config] Embedding load timeout (s): {cls.EMBEDDING_LOAD_TIMEOUT_SECONDS}")


# Initialize NER labels on module import
NER_LABELS = Config.load_ner_labels()
print(f"[Config] Using {len(NER_LABELS)} NER labels: {NER_LABELS}")
