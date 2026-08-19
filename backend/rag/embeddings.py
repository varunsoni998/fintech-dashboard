"""
Embedding service — calls OpenRouter's embeddings API.

Text embeddings:  nvidia/nemotron-3-embed-1b:free
Visual embeddings: nvidia/llama-nemotron-embed-vl-1b-v2:free

Both use the same /v1/embeddings endpoint.
Visual model accepts base64-encoded image strings.
"""
import time
import base64
import logging
from typing import Union

import requests

from .config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    TEXT_EMBED_MODEL,
    VL_EMBED_MODEL,
)

logger = logging.getLogger(__name__)

EMBED_ENDPOINT = f"{OPENROUTER_BASE_URL}/embeddings"
MAX_RETRIES = 3
RETRY_DELAY = 2.0  # seconds


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }


def _call_embeddings(model: str, inputs: list, retry: int = 0) -> list[list[float]]:
    """
    Raw call to the OpenRouter embeddings endpoint.
    Returns a list of embedding vectors (one per input).
    """
    payload = {"model": model, "input": inputs}
    try:
        resp = requests.post(
            EMBED_ENDPOINT,
            headers=_headers(),
            json=payload,
            timeout=60,
        )
        if resp.status_code == 429:
            # Rate limited — back off and retry
            wait = RETRY_DELAY * (2 ** retry)
            logger.warning("Rate limited by OpenRouter, waiting %.1fs", wait)
            time.sleep(wait)
            if retry < MAX_RETRIES:
                return _call_embeddings(model, inputs, retry + 1)
            raise RuntimeError("OpenRouter rate limit exceeded after retries")

        resp.raise_for_status()
        data = resp.json()

        # OpenRouter returns {"data": [{"embedding": [...], "index": 0}, ...]}
        embeddings = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in embeddings]

    except requests.exceptions.Timeout:
        if retry < MAX_RETRIES:
            logger.warning("Embedding API timeout, retrying (%d/%d)", retry + 1, MAX_RETRIES)
            time.sleep(RETRY_DELAY)
            return _call_embeddings(model, inputs, retry + 1)
        raise RuntimeError("Embedding API timed out after retries")

    except requests.exceptions.RequestException as e:
        if retry < MAX_RETRIES:
            logger.warning("Embedding API error: %s, retrying", e)
            time.sleep(RETRY_DELAY)
            return _call_embeddings(model, inputs, retry + 1)
        raise RuntimeError(f"Embedding API failed: {e}") from e


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of text strings using the Nemotron text embedding model.
    Batches automatically if needed (max 32 per call to be safe).
    """
    if not texts:
        return []

    results: list[list[float]] = []
    batch_size = 32

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        vecs = _call_embeddings(TEXT_EMBED_MODEL, batch)
        results.extend(vecs)

    return results


def embed_text(text: str) -> list[float]:
    """Embed a single text string."""
    return embed_texts([text])[0]


def embed_image_base64(image_b64: str) -> list[float]:
    """
    Embed a single image (base64-encoded JPEG/PNG) using the Nemotron VL model.
    The model accepts a data URL or raw base64.
    """
    # Wrap in data URL if not already
    if not image_b64.startswith("data:"):
        image_input = f"data:image/png;base64,{image_b64}"
    else:
        image_input = image_b64

    vecs = _call_embeddings(VL_EMBED_MODEL, [image_input])
    return vecs[0]


def embed_images_base64(images_b64: list[str]) -> list[list[float]]:
    """Embed multiple images. Each item is a base64 string."""
    if not images_b64:
        return []

    results: list[list[float]] = []
    for img in images_b64:  # visual model: 1 at a time to be safe
        vec = embed_image_base64(img)
        results.append(vec)

    return results
