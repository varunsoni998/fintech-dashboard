"""
Embedding service — Jina AI embeddings (completely free tier).

Model:   jina-embeddings-v3  (1024-dim, multilingual, retrieval-optimised)
API:     https://api.jina.ai/v1/embeddings
Free:    1M tokens/month, no credit card required
Key:     https://jina.ai/?sui=apikey  → add JINA_API_KEY to backend/.env

Uses task="retrieval.passage" when indexing, task="retrieval.query" when querying.
This improves retrieval quality significantly (asymmetric embedding).
"""
import hashlib
import logging
import math
import random
import time

import requests

from .config import (
    JINA_API_KEY,
    JINA_EMBED_URL,
    TEXT_EMBED_MODEL,
    TEXT_EMBED_DIM,
)

logger = logging.getLogger(__name__)

MAX_RETRIES     = 4
BASE_DELAY      = 1.5
MAX_DELAY       = 30.0
JITTER          = 0.25
RETRYABLE_CODES = {429, 500, 502, 503, 504}

FALLBACK_DIM = TEXT_EMBED_DIM   # 1024 — must stay consistent


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _backoff(attempt: int) -> float:
    delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
    jitter = delay * JITTER * (2 * random.random() - 1)
    return max(0.5, delay + jitter)


def _fallback_embedding(text: str, dim: int = FALLBACK_DIM) -> list[float]:
    """
    Hash-based pseudo-embedding — only used if Jina API is completely down.
    Keeps the same dimension so vectors remain comparable in Supabase.
    """
    vec = [0.0] * dim
    text_lower = text.lower()
    for i in range(len(text_lower) - 2):
        gram = text_lower[i:i+3]
        h = int(hashlib.md5(gram.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1 if (h >> 16) & 1 else -1
        vec[idx] += sign * 0.1
    norm = math.sqrt(sum(x*x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _call_jina(inputs: list[str], task: str, attempt: int = 0) -> list[list[float]]:
    """
    Call Jina AI embeddings API with retry on transient errors.
    task: "retrieval.passage" for indexing, "retrieval.query" for queries.
    """
    if not JINA_API_KEY:
        raise RuntimeError(
            "JINA_API_KEY is not set. "
            "Get a free key at https://jina.ai/?sui=apikey and add "
            "JINA_API_KEY=jina_... to your backend/.env file."
        )

    payload = {
        "model": TEXT_EMBED_MODEL,
        "input": inputs,
        "task": task,
        "late_chunking": False,
        "embedding_type": "float",
    }

    try:
        resp = requests.post(
            JINA_EMBED_URL,
            headers=_headers(),
            json=payload,
            timeout=60,
        )

        if resp.status_code in RETRYABLE_CODES:
            if attempt < MAX_RETRIES:
                wait = _backoff(attempt)
                logger.warning(
                    "Jina API %d — retry %d/%d in %.1fs",
                    resp.status_code, attempt + 1, MAX_RETRIES, wait,
                )
                time.sleep(wait)
                return _call_jina(inputs, task, attempt + 1)
            raise RuntimeError(
                f"Jina embedding API returned {resp.status_code} after "
                f"{MAX_RETRIES} retries. Body: {resp.text[:300]}"
            )

        if not resp.ok:
            raise RuntimeError(
                f"Jina embedding API error {resp.status_code}: {resp.text[:300]}"
            )

        data = resp.json()
        # Jina returns: {"data": [{"index": 0, "embedding": [...]}, ...]}
        items = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in items]

    except requests.exceptions.Timeout:
        if attempt < MAX_RETRIES:
            wait = _backoff(attempt)
            logger.warning("Jina timeout — retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
            return _call_jina(inputs, task, attempt + 1)
        raise RuntimeError(f"Jina embedding timed out after {MAX_RETRIES} retries")

    except requests.exceptions.ConnectionError as e:
        if attempt < MAX_RETRIES:
            wait = _backoff(attempt)
            logger.warning("Jina connection error — retry %d/%d in %.1fs", attempt + 1, MAX_RETRIES, wait)
            time.sleep(wait)
            return _call_jina(inputs, task, attempt + 1)
        raise RuntimeError(f"Jina connection failed: {e}") from e

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Jina unexpected error: {e}") from e


def embed_texts(
    texts: list[str],
    task: str = "retrieval.passage",
    use_fallback_on_failure: bool = True,
) -> list[list[float]]:
    """
    Embed a list of text strings for indexing (passage task).
    Batches in groups of 32 (Jina's recommended batch size).
    """
    if not texts:
        return []

    results: list[list[float]] = []
    batch_size = 32

    for i in range(0, len(texts), batch_size):
        batch = texts[i: i + batch_size]
        try:
            vecs = _call_jina(batch, task=task)
            results.extend(vecs)
            logger.debug(
                "Jina embedded batch %d-%d → %d vecs dim=%d",
                i, i + len(batch), len(vecs), len(vecs[0]) if vecs else 0,
            )
        except RuntimeError as e:
            if use_fallback_on_failure:
                logger.error(
                    "Jina API failed for batch %d-%d: %s — "
                    "using hash fallback. Re-upload or /reembed when API recovers.",
                    i, i + len(batch), e,
                )
                for text in batch:
                    results.append(_fallback_embedding(text))
            else:
                raise

    return results


def embed_text(text: str, task: str = "retrieval.query") -> list[float]:
    """
    Embed a single query string.
    Uses task="retrieval.query" for asymmetric retrieval.
    """
    return embed_texts([text], task=task)[0]


def embed_image_base64(
    image_b64: str,
    use_fallback_on_failure: bool = True,
) -> list[float]:
    """
    Jina v3 does not support image embeddings via the free API.
    Falls back to a hash embedding so the pipeline doesn't break.
    Visual retrieval will not be effective until a VL embed model is added.
    """
    logger.debug("Visual embedding requested — using text-hash fallback (Jina v3 is text-only)")
    return _fallback_embedding(image_b64[:500])


def embed_images_base64(images_b64: list[str]) -> list[list[float]]:
    return [embed_image_base64(img) for img in images_b64]
