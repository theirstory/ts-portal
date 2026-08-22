"""Local embedding service using SentenceTransformers (Hugging Face).

Supports text-only models (LaBSE, Qwen3-Embedding, EmbeddingGemma, ...) and multimodal
models that embed text and images into one shared vector space (Qwen3-VL-Embedding).
When a multimodal model is configured, transcript chunks, document pages, and photographs
all land in the same space, so a single query vector can retrieve across every source type.
"""

from __future__ import annotations

import base64
import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any, Dict, List, Optional, Sequence, Union

import numpy as np
from sentence_transformers import SentenceTransformer

from config import Config

logger = logging.getLogger(__name__)

# An item to embed: plain text, an image, or an image paired with its text
# (for a document page, the page image plus its OCR text).
MultimodalItem = Dict[str, Any]


def _resolve_device() -> str:
    """Pick the best available torch device.

    `USE_GPU` selects CUDA to preserve existing deployment behaviour. `EMBEDDING_DEVICE`
    overrides everything, and Apple Silicon (MPS) is used automatically when present,
    which matters because image encoding is roughly an order of magnitude more expensive
    per item than text and is painful on CPU.

    Returns:
        A torch device string: "cuda", "mps", or "cpu".
    """
    configured = (Config.EMBEDDING_DEVICE or "").strip().lower()
    if configured:
        return configured

    if Config.USE_GPU:
        return "cuda"

    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
    except Exception:  # pragma: no cover - torch always present in practice
        pass

    return "cpu"


class LocalEmbedding:
    """Local embedding service backed by Hugging Face SentenceTransformers.

    The model is downloaded automatically on first use and cached under:
    ~/.cache/huggingface/

    Subsequent runs will reuse the cached model.
    """

    _model: Optional[SentenceTransformer] = None
    _device: Optional[str] = None

    @classmethod
    def get_model(cls) -> SentenceTransformer:
        """Lazily load and cache the embedding model.

        Returns:
            A SentenceTransformer model instance.
        """
        if cls._model is None:
            device = _resolve_device()
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
                    "Verify internet/cache for the configured EMBEDDING_MODEL "
                    f"('{model_name}') or switch EMBEDDING_MODEL to another model."
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

            cls._device = device
            dim = cls._model.get_sentence_embedding_dimension()
            elapsed = time.time() - started_at
            logger.info(
                "[LocalEmbedding] Model loaded successfully in %.2fs (device=%s, dim=%s)",
                elapsed,
                device,
                dim,
            )

        return cls._model

    @classmethod
    def is_loaded(cls) -> bool:
        """Return True when the embedding model has already been initialized."""
        return cls._model is not None

    @classmethod
    def get_device(cls) -> str:
        """Return the device the model is loaded on (resolving it if not yet loaded)."""
        return cls._device or _resolve_device()

    @classmethod
    def supports_images(cls) -> bool:
        """Return True when the configured model can embed images, not just text.

        Determined from the loaded model's processor rather than a hardcoded model list,
        so swapping EMBEDDING_MODEL does not require editing this file.
        """
        model = cls.get_model()
        for module in model:
            processor = getattr(module, "processor", None)
            if processor is not None and hasattr(processor, "image_processor"):
                return True
        return False

    @classmethod
    def _encode_kwargs(cls) -> Dict[str, Any]:
        """Shared encode arguments, including optional Matryoshka truncation."""
        kwargs: Dict[str, Any] = {"convert_to_numpy": True}

        # Matryoshka models (Qwen3-VL-Embedding, EmbeddingGemma) can be truncated to a
        # shorter vector with graceful quality loss, trading recall for index size.
        if Config.EMBEDDING_TRUNCATE_DIM:
            kwargs["truncate_dim"] = int(Config.EMBEDDING_TRUNCATE_DIM)

        return kwargs

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
            **cls._encode_kwargs(),
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
            return [0.0] * cls.get_embedding_dimension()

        embedding = model.encode([text], **cls._encode_kwargs())[0]
        return embedding.tolist()

    @classmethod
    def _prepare_image(cls, image: "Any") -> "Any":
        """Cap an image's long edge before encoding.

        The vision processor rescales internally, so this is about bounding peak memory
        on large scanned pages (a 150 DPI photographic page can exceed 8000px) rather
        than about speed.
        """
        from PIL import Image

        if not isinstance(image, Image.Image):
            return image

        limit = int(Config.EMBEDDING_IMAGE_MAX_EDGE)
        if limit <= 0:
            return image

        width, height = image.size
        longest = max(width, height)
        if longest <= limit:
            return image

        scale = limit / longest
        return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.LANCZOS)

    @classmethod
    def _load_image(cls, item: MultimodalItem) -> Optional["Any"]:
        """Load an image from a base64 payload or a filesystem path."""
        from PIL import Image

        encoded = item.get("image_base64")
        path = item.get("image_path")

        try:
            if encoded:
                raw = base64.b64decode(encoded)
                image = Image.open(io.BytesIO(raw))
            elif path:
                image = Image.open(path)
            else:
                return None

            return cls._prepare_image(image.convert("RGB"))
        except Exception as exc:
            logger.warning("[LocalEmbedding] Could not load image (%s): %s", path or "base64", exc)
            return None

    @classmethod
    def encode_multimodal(
        cls,
        items: Sequence[MultimodalItem],
        batch_size: Optional[int] = None,
    ) -> np.ndarray:
        """Embed a mixed batch of text, images, and image+text pairs.

        Each item is a dict with any of:
            - ``text``: text to embed
            - ``image_base64`` / ``image_path``: the image to embed
        An item carrying both is embedded as a single image+text input, which measurably
        improves retrieval for pages whose meaning is split between the two (a chart with
        an axis label, a memo with a letterhead).

        Args:
            items: Items to embed.
            batch_size: Images cost far more than text per item, so this defaults to
                the (much smaller) EMBEDDING_IMAGE_BATCH_SIZE.

        Returns:
            A numpy array with shape (len(items), embedding_dim), or an empty array when
            `items` is empty. Items that carry neither text nor a loadable image get a
            zero vector so positions always line up with the input.
        """
        if not items:
            return np.array([])

        model = cls.get_model()
        dim = cls.get_embedding_dimension()

        prepared: List[Union[str, Dict[str, Any]]] = []
        positions: List[int] = []

        for index, item in enumerate(items):
            text = (item.get("text") or "").strip()
            image = cls._load_image(item)

            if image is not None and text:
                prepared.append({"image": image, "text": text})
            elif image is not None:
                prepared.append({"image": image})
            elif text:
                prepared.append(text)
            else:
                continue

            positions.append(index)

        vectors = np.zeros((len(items), dim), dtype=np.float32)

        if not prepared:
            logger.warning("[LocalEmbedding] No embeddable content in %s items", len(items))
            return vectors

        # Batch size is chosen by what is actually in the batch. Images are heavy and get the
        # small EMBEDDING_IMAGE_BATCH_SIZE; a text-only batch does not, and forcing it to 2
        # turned passage localisation into a dozen sequential forward passes.
        has_image = any(isinstance(item, dict) and 'image' in item for item in prepared)
        effective_batch = batch_size or (
            int(Config.EMBEDDING_IMAGE_BATCH_SIZE) if has_image else 32
        )

        encoded = model.encode(
            prepared,
            batch_size=effective_batch,
            show_progress_bar=len(prepared) > 50,
            **cls._encode_kwargs(),
        )

        for slot, index in enumerate(positions):
            vectors[index] = encoded[slot]

        return vectors

    @classmethod
    def get_embedding_dimension(cls) -> int:
        """Return the embedding vector dimension produced by the configured model."""
        if Config.EMBEDDING_TRUNCATE_DIM:
            return int(Config.EMBEDDING_TRUNCATE_DIM)
        return cls.get_model().get_sentence_embedding_dimension()
