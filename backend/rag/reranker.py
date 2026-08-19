"""
Reranker — calls nvidia/llama-nemotron-rerank-vl-1b-v2:free via OpenRouter
to reorder retrieved candidates by relevance to the query.

The rerank endpoint differs from embeddings/chat — it takes a query + passages
and returns relevance scores. We use the /v1/rerank endpoint (OpenRouter).
Falls back gracefully to score-based ordering if the reranker API fails.
"""
import logging
import time
import requests
from .config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    RERANK_MODEL,
    RERANK_TOP_K,
)

logger = logging.getLogger(__name__)

RERANK_ENDPOINT = f"{OPENROUTER_BASE_URL}/rerank"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }


def rerank_candidates(
    query: str,
    candidates: list[dict],
    top_k: int = RERANK_TOP_K,
) -> list[dict]:
    """
    Rerank a list of candidate chunks using the Nemotron VL reranker.

    Each candidate must have at least a 'text' field.
    Returns the top_k candidates sorted by reranker relevance score.

    Falls back to original cosine-similarity ordering if the API fails.
    """
    if not candidates:
        return []

    if len(candidates) <= top_k:
        # Nothing to rerank — just return sorted by existing score
        return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)

    # Build passage list — use text chunks; for visual-only hits use filename+page as context
    passages = []
    for c in candidates:
        text = c.get("text", "").strip()
        if not text:
            text = f"[Page {c.get('page_number', '?')} of {c.get('filename', 'document')}]"
        passages.append({"text": text})

    payload = {
        "model": RERANK_MODEL,
        "query": query,
        "documents": passages,
        "top_n": top_k,
    }

    try:
        resp = requests.post(
            RERANK_ENDPOINT,
            headers=_headers(),
            json=payload,
            timeout=30,
        )

        if resp.status_code == 429:
            logger.warning("Reranker rate limited — falling back to cosine ordering")
            return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[:top_k]

        if resp.status_code in (404, 422, 501):
            # Rerank endpoint not available for this model on this tier
            logger.warning("Reranker not available (status %d) — using cosine ordering", resp.status_code)
            return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[:top_k]

        resp.raise_for_status()
        data = resp.json()

        # OpenRouter rerank response: {"results": [{"index": 0, "relevance_score": 0.9}, ...]}
        results = data.get("results", [])
        if not results:
            logger.warning("Reranker returned empty results — falling back")
            return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[:top_k]

        reranked = []
        for r in results:
            idx = r.get("index", 0)
            rel_score = r.get("relevance_score", 0.0)
            if idx < len(candidates):
                candidate = dict(candidates[idx])
                candidate["rerank_score"] = rel_score
                candidate["score"] = rel_score  # override with reranker score
                reranked.append(candidate)

        return reranked[:top_k]

    except requests.exceptions.Timeout:
        logger.warning("Reranker timed out — using cosine ordering")
        return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[:top_k]

    except Exception as e:
        logger.warning("Reranker error (%s) — using cosine ordering", e)
        return sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[:top_k]
