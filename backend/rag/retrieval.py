"""
Vector retrieval — fetches chunks from Supabase and ranks by cosine similarity.
No Qdrant needed: embeddings are stored as JSONB arrays in Supabase,
loaded into numpy for cosine similarity.
"""
import logging
import numpy as np
from typing import Optional

from supabase_client import supabase
from .config import TEXT_RETRIEVAL_TOP_K, VL_RETRIEVAL_TOP_K

logger = logging.getLogger(__name__)


def cosine_similarity(query_vec: list[float], matrix: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between a query vector and a matrix of vectors."""
    q = np.array(query_vec, dtype=np.float32)
    q_norm = np.linalg.norm(q)
    if q_norm == 0:
        return np.zeros(matrix.shape[0])
    q = q / q_norm

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1e-10, norms)
    mat = matrix / norms

    return mat @ q  # shape: (N,)


def retrieve_text_chunks(
    query_embedding: list[float],
    user_id: str,
    document_ids: Optional[list[str]] = None,
    top_k: int = TEXT_RETRIEVAL_TOP_K,
) -> list[dict]:
    """
    Retrieve top-k text chunks by cosine similarity.
    user_id enforces access control — users only see their own docs.
    document_ids optionally restricts to specific documents.
    """
    try:
        # Fetch all chunks belonging to this user's documents
        # We join through rag_documents to enforce ownership
        query = (
            supabase.table("rag_chunks")
            .select("id, document_id, filename, page_number, chunk_index, text, embedding")
        )

        if document_ids:
            query = query.in_("document_id", document_ids)

        # Filter to user's documents via a subquery approach:
        # Get the user's document IDs first, then filter chunks
        if not document_ids:
            doc_result = (
                supabase.table("rag_documents")
                .select("id")
                .eq("user_id", user_id)
                .execute()
            )
            user_doc_ids = [r["id"] for r in (doc_result.data or [])]
            if not user_doc_ids:
                return []
            query = query.in_("document_id", user_doc_ids)

        result = query.execute()
        rows = result.data or []

        if not rows:
            return []

        # Build embedding matrix
        embeddings = []
        valid_rows = []
        for row in rows:
            emb = row.get("embedding")
            if emb and isinstance(emb, list) and len(emb) > 0:
                embeddings.append(emb)
                valid_rows.append(row)

        if not embeddings:
            return []

        matrix = np.array(embeddings, dtype=np.float32)
        scores = cosine_similarity(query_embedding, matrix)

        # Get top-k indices
        k = min(top_k, len(valid_rows))
        top_indices = np.argsort(scores)[::-1][:k]

        results = []
        for idx in top_indices:
            row = valid_rows[idx]
            results.append({
                "id": row["id"],
                "document_id": row["document_id"],
                "filename": row["filename"],
                "page_number": row["page_number"],
                "chunk_index": row["chunk_index"],
                "text": row["text"],
                "score": float(scores[idx]),
                "source_type": "text",
            })

        return results

    except Exception as e:
        logger.error("Text retrieval failed: %s", e)
        return []


def retrieve_visual_chunks(
    query_embedding: list[float],
    user_id: str,
    document_ids: Optional[list[str]] = None,
    top_k: int = VL_RETRIEVAL_TOP_K,
) -> list[dict]:
    """Retrieve top-k visual (page-level) chunks by cosine similarity."""
    try:
        query = (
            supabase.table("rag_visual_chunks")
            .select("id, document_id, filename, page_number, embedding")
        )

        if document_ids:
            query = query.in_("document_id", document_ids)
        else:
            doc_result = (
                supabase.table("rag_documents")
                .select("id")
                .eq("user_id", user_id)
                .execute()
            )
            user_doc_ids = [r["id"] for r in (doc_result.data or [])]
            if not user_doc_ids:
                return []
            query = query.in_("document_id", user_doc_ids)

        result = query.execute()
        rows = result.data or []
        if not rows:
            return []

        embeddings = []
        valid_rows = []
        for row in rows:
            emb = row.get("embedding")
            if emb and isinstance(emb, list):
                embeddings.append(emb)
                valid_rows.append(row)

        if not embeddings:
            return []

        matrix = np.array(embeddings, dtype=np.float32)
        scores = cosine_similarity(query_embedding, matrix)

        k = min(top_k, len(valid_rows))
        top_indices = np.argsort(scores)[::-1][:k]

        results = []
        for idx in top_indices:
            row = valid_rows[idx]
            results.append({
                "id": row["id"],
                "document_id": row["document_id"],
                "filename": row["filename"],
                "page_number": row["page_number"],
                "score": float(scores[idx]),
                "source_type": "visual",
            })

        return results

    except Exception as e:
        logger.error("Visual retrieval failed: %s", e)
        return []


def deduplicate_candidates(
    text_results: list[dict],
    visual_results: list[dict],
) -> list[dict]:
    """
    Merge text and visual candidates.
    If the same (document, page) appears in both, keep the text result
    but boost its score slightly.
    """
    seen: set[tuple] = set()
    merged: list[dict] = []

    # Add text results first
    for r in text_results:
        key = (r["document_id"], r["page_number"])
        seen.add(key)
        merged.append(r)

    # Add visual results that don't overlap with text results
    # (or boost existing ones)
    for r in visual_results:
        key = (r["document_id"], r["page_number"])
        if key in seen:
            # Boost existing text chunk's score
            for existing in merged:
                if (existing["document_id"], existing["page_number"]) == key:
                    existing["score"] = existing["score"] * 1.1  # 10% visual boost
                    existing["has_visual"] = True
                    break
        else:
            seen.add(key)
            merged.append(r)

    # Re-sort by score
    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged
