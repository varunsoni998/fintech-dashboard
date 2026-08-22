"""
Embedding service — calls OpenRouter's embeddings API.

Text embeddings:   nvidia/nemotron-3-embed-1b:free
Visual embeddings: nvidia/llama-nemotron-embed-vl-1b-v2:free

Handles 503 / rate-limit / timeout with exponential backoff + jitter.
Falls back to a hash-based pseudo-embedding if the API is completely
unavailable, so uploads never get permanently stuck.
"""
import hashlib
import logging
import math
import random
import time
from typing import Optional

import requests

from .config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    TEXT_EMBED_MODEL,
    VL_EMBED_MODEL,
)

logger = logging.getLogger(__name__)

EMBED_ENDPOINT = f"{OPENROUTER_BASE_URL}/embeddings"

# Retry config
MAX_RETRIES   = 5
BASE_DELAY    = 2.0   # seconds
MAX_DELAY     = 60.0  # seconds
JITTER        = 0.3   # ± 30 % random jitter

# Transient HTTP status codes that warrant a retry
RETRYABLE_CODES = {429, 500, 502, 503, 504}

# Fallback embedding dimension — must match what we write to Supabase.
# We use 1024 so it's consistent if the real model returns 1024-dim vecs.
FALLBACK_DIM = 1024


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://businessos.app",
        "X-Title": "BusinessOS RAG",
    }


def _backoff(attempt: int) -> float:
    """Exponential backoff with jitter."""
    delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
    jitter = delay * JITTER * (2 * random.random() - 1)
    return max(0.5, delay + jitter)


def _fallback_embedding(text: str, dim: int = FALLBACK_DIM) -> list[float]:
    """
    Deterministic hash-based pseudo-embedding used when the API is down.
    Preserves some semantic signal via character n-gram hashing.
    NOT suitable for production retrieval quality — but allows the upload
    to complete and be re-embedded later rather than failing permanently.
    """
    vec = [0.0] * dim
    # Use overlapping 3-grams so similar texts produce similar vectors
    text_lower = text.lower()
    for i in range(len(text_lower) - 2):
        gram = text_lower[i:i+3]
        h = int(hashlib.md5(gram.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1 if (h >> 16) & 1 else -1
        vec[idx] += sign * 0.1

    # L2-normalise
    norm = math.sqrt(sum(x*x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _call_embeddings_with_retry(
    model: str,
    inputs: list,
    attempt: int = 0,
) -> list[list[float]]:
    """
    Call the OpenRouter embeddings endpoint with retry on transient errors.
    Returns a list of float vectors.
    """
    try:
        resp = requests.post(
            EMBED_ENDPOINT,
            headers=_headers(),
            json={"model": model, "input": inputs},
            timeout=90,
        )

        # Retryable server-side errors
        if resp.status_code in RETRYABLE_CODES:
            if attempt < MAX_RETRIES:
                wait = _backoff(attempt)
                logger.warning(
                    "Embedding API %d for model %s — retry %d/%d in %.1fs",
                    resp.status_code, model, attempt + 1, MAX_RETRIES, wait,
                )
                time.sleep(wait)
                return _call_embeddings_with_retry(model, inputs, attempt + 1)
            raise RuntimeError(
                f"Embedding API returned {resp.status_code} after {MAX_RETRIES} retries. "
                f"Response: {resp.text[:300]}"
            )

        resp.raise_for_status()
        data = resp.json()

        # OpenRouter: {"data": [{"embedding": [...], "index": 0}, ...]}
        items = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in items]

    except requests.exceptions.Timeout:
        if attempt < MAX_RETRIES:
            wait = _backoff(attempt)
            logger.warning("Embedding API timeout — retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
            return _call_embeddings_with_retry(model, inputs, attempt + 1)
        raise RuntimeError(f"Embedding API timed out after {MAX_RETRIES} retries")

    except requests.exceptions.ConnectionError as e:
        if attempt < MAX_RETRIES:
            wait = _backoff(attempt)
            logger.warning("Embedding API connection error — retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
            return _call_embeddings_with_retry(model, inputs, attempt + 1)
        raise RuntimeError(f"Embedding API connection failed: {e}") from e

    except RuntimeError:
        raise

    except Exception as e:
        raise RuntimeError(f"Embedding API unexpected error: {e}") from e


def embed_texts(
    texts: list[str],
    use_fallback_on_failure: bool = True,
) -> list[list[float]]:
    """
    Embed a list of text strings using the Nemotron text embedding model.
    Batches in groups of 32. Falls back to hash embeddings if API is down.
    """
    if not texts:
        return []

    results: list[list[float]] = []
    batch_size = 32

    for i in range(0, len(texts), batch_size):
        batch = texts[i: i + batch_size]
        try:
            vecs = _call_embeddings_with_retry(TEXT_EMBED_MODEL, batch)
            results.extend(vecs)
        except RuntimeError as e:
            if use_fallback_on_failure:
                logger.error(
                    "Embedding API permanently failed for batch %d-%d: %s — "
                    "using fallback hash embeddings for this batch.",
                    i, i + len(batch), e,
                )
                for text in batch:
                    results.append(_fallback_embedding(text))
            else:
                raise

    return results


def embed_text(text: str) -> list[float]:
    """Embed a single text string."""
    return embed_texts([text])[0]


def embed_image_base64(
    image_b64: str,
    use_fallback_on_failure: bool = True,
) -> list[float]:
    """
    Embed a single image (base64) using the Nemotron VL model.
    Falls back silently if the visual model is unavailable.
    """
    if not image_b64.startswith("data:"):
        image_input = f"data:image/png;base64,{image_b64}"
    else:
        image_input = image_b64

    try:
        vecs = _call_embeddings_with_retry(VL_EMBED_MODEL, [image_input])
        return vecs[0]
    except RuntimeError as e:
        if use_fallback_on_failure:
            logger.warning("Visual embedding failed (%s) — using fallback", e)
            return _fallback_embedding(image_b64[:500])
        raise


def embed_images_base64(images_b64: list[str]) -> list[list[float]]:
    """Embed multiple images. Processes one at a time."""
    return [embed_image_base64(img) for img in images_b64]
