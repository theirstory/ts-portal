"""Local embedding service using SentenceTransformers (Hugging Face)."""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from config import Config

logger = logging.getLogger(__name__)


class LocalEmbedding:
    """Local embedding service backed by Hugging Face SentenceTransformers.

    The model is downloaded automatically on first use and cached under:
    ~/.cache/huggingface/

    Subsequent runs will reuse the cached model.
    """

    _model: Optional[SentenceTransformer] = None

    @classmethod
    def get_model(cls) -> SentenceTransformer:
        """Lazily load and cache the embedding model.

        Returns:
            A SentenceTransformer model instance.
        """
        if cls._model is None:
            device = "cuda" if Config.USE_GPU else "cpu"
            model_name = Config.EMBEDDING_MODEL
            timeout = max(1, int(Config.EMBEDDING_LOAD_TIMEOUT_SECONDS))
            started_at = time.time()

            logger.info(
                "[LocalEmbedding] Loading model '%s' on device '%s' (timeout=%ss)",
                model_name,
                device,
                timeout,
            )

            executor = ThreadPoolExecutor(max_workers=1)
            future = executor.submit(SentenceTransformer, model_name, device=device)
            try:
                poll_seconds = 10
                while True:
                    elapsed = time.time() - started_at
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        raise FutureTimeoutError()

                    try:
                        cls._model = future.result(timeout=min(poll_seconds, remaining))
                        break
                    except FutureTimeoutError:
                        logger.info(
                            "[LocalEmbedding] Still loading model '%s'... %.0fs elapsed",
                            model_name,
                            time.time() - started_at,
                        )
            except FutureTimeoutError as exc:
                message = (
                    "[LocalEmbedding] Timeout loading embedding model "
                    f"'{model_name}' after {timeout}s. "
                    "Verify internet/cache and try a lighter model, e.g. "
                    "'sentence-transformers/all-MiniLM-L6-v2'."
                )
                logger.error(message)
                raise RuntimeError(message) from exc
            except Exception as exc:
                message = (
                    "[LocalEmbedding] Failed to load embedding model "
                    f"'{model_name}': {exc}"
                )
                logger.exception(message)
                raise RuntimeError(message) from exc
            finally:
                executor.shutdown(wait=False, cancel_futures=True)

            dim = cls._model.get_sentence_embedding_dimension()
            elapsed = time.time() - started_at
            logger.info(
                "[LocalEmbedding] Model loaded successfully in %.2fs (dim=%s)",
                elapsed,
                dim,
            )

        return cls._model

    @classmethod
    def is_loaded(cls) -> bool:
        """Return True when the embedding model has already been initialized."""
        return cls._model is not None

    @classmethod
    def encode(cls, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """Generate embeddings for a list of texts.

        Args:
            texts: Strings to encode.
            batch_size: Number of texts to process per batch.

        Returns:
            A numpy array with shape (len(texts), embedding_dim).
            If `texts` is empty, returns an empty array.
        """
        if not texts:
            return np.array([])

        model = cls.get_model()
        return model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=len(texts) > 100,
            convert_to_numpy=True,
        )

    @classmethod
    def encode_single(cls, text: str) -> List[float]:
        """Generate an embedding for a single text.

        Args:
            text: String to encode.

        Returns:
            A list of floats representing the embedding vector.
            If `text` is empty, returns a zero vector of the correct dimension.
        """
        model = cls.get_model()

        if not text:
            dim = model.get_sentence_embedding_dimension()
            return [0.0] * dim

        embedding = model.encode([text], convert_to_numpy=True)[0]
        return embedding.tolist()

    @classmethod
    def get_embedding_dimension(cls) -> int:
        """Return the embedding vector dimension produced by the configured model."""
        return cls.get_model().get_sentence_embedding_dimension()


# Debug / smoke test
if __name__ == "__main__":
    print("Testing LocalEmbedding service...")

    test_texts = [
        "Hola, ¿cómo estás?",
        "Este es un testimonio de prueba.",
        "Natural language processing is fascinating.",
    ]

    dim = LocalEmbedding.get_embedding_dimension()
    print(f"\nEmbedding dimension: {dim}")

    print(f"\nGenerating embeddings for {len(test_texts)} texts...")
    embeddings = LocalEmbedding.encode(test_texts)

    print(f"Shape: {embeddings.shape}")
    print(f"First embedding (first 10 values): {embeddings[0][:10]}")

    print("\nTest completed successfully!")
