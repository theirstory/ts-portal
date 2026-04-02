"""Helpers for loading spaCy models lazily at runtime."""

from __future__ import annotations

import logging
from functools import lru_cache

import spacy
from spacy.cli import download as spacy_download


logger = logging.getLogger(__name__)

EN_CORE_WEB_SM = "en_core_web_sm"


@lru_cache(maxsize=1)
def ensure_en_sentence_model():
    """Ensure `en_core_web_sm` is installed before loading pipelines."""
    try:
        logger.info("[spaCy] Checking model '%s'", EN_CORE_WEB_SM)
        spacy.load(EN_CORE_WEB_SM, disable=["ner"])
    except OSError:
        logger.info("[spaCy] Model '%s' not installed. Downloading lazily...", EN_CORE_WEB_SM)
        spacy_download(EN_CORE_WEB_SM)
        logger.info("[spaCy] Download complete for '%s'", EN_CORE_WEB_SM)
    return True


def get_en_sentence_nlp():
    """Load a fresh `en_core_web_sm` pipeline after ensuring installation."""
    ensure_en_sentence_model()
    logger.info("[spaCy] Loading fresh pipeline '%s'", EN_CORE_WEB_SM)
    return spacy.load(EN_CORE_WEB_SM, disable=["ner"])
