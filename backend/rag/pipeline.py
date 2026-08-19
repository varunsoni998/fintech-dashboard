"""
RAG pipeline — orchestrates retrieval → reranking → generation.
This is the single entry point for the query flow.
"""
import logging
from typing import Generator, Optional

from .embeddings import embed_text, embed_image_base64
from .retrieval import retrieve_text_chunks, retrieve_visual_chunks, deduplicate_candidates
from .reranker import rerank_candidates
from .generator import generate_answer_streaming
from .config import TEXT_RETRIEVAL_TOP_K, VL_RETRIEVAL_TOP_K, RERANK_TOP_K

logger = logging.getLogger(__name__)


def run_rag_query(
    query: str,
    user_id: str,
    notes: str = "",
    sources: list[str] = None,  # ["pdf", "email", "web"]
    document_ids: Optional[list[str]] = None,
) -> Generator[str, None, None]:
    """
    Full RAG pipeline — yields SSE tokens then a final done event.

    Flow:
        1. Embed query (text)
        2. Retrieve text candidates
        3. Retrieve visual candidates (if PDF source selected)
        4. Deduplicate + merge
        5. Rerank
        6. Generate answer with context
    """
    sources = sources or ["pdf"]
    use_pdf = "pdf" in sources
    use_visual = use_pdf  # visual retrieval only for PDF

    # ── Step 1: Embed query ───────────────────────────────────────────────────
    try:
        query_embedding = embed_text(query)
    except Exception as e:
        import json
        logger.error("Query embedding failed: %s", e)
        yield f"data: {json.dumps({'error': f'Could not embed query: {e}'})}\n\n"
        return

    # ── Step 2: Text retrieval ────────────────────────────────────────────────
    text_candidates = []
    if use_pdf:
        text_candidates = retrieve_text_chunks(
            query_embedding=query_embedding,
            user_id=user_id,
            document_ids=document_ids,
            top_k=TEXT_RETRIEVAL_TOP_K,
        )
        logger.info("Text retrieval: %d candidates", len(text_candidates))

    # ── Step 3: Visual retrieval ──────────────────────────────────────────────
    visual_candidates = []
    if use_visual:
        try:
            # Use same text embedding for visual query — cross-modal retrieval
            # (the VL model was trained to align text and image spaces)
            visual_candidates = retrieve_visual_chunks(
                query_embedding=query_embedding,
                user_id=user_id,
                document_ids=document_ids,
                top_k=VL_RETRIEVAL_TOP_K,
            )
            logger.info("Visual retrieval: %d candidates", len(visual_candidates))
        except Exception as e:
            logger.warning("Visual retrieval failed (non-fatal): %s", e)

    # ── Step 4: Merge + deduplicate ───────────────────────────────────────────
    all_candidates = deduplicate_candidates(text_candidates, visual_candidates)
    logger.info("After dedup: %d candidates", len(all_candidates))

    if not all_candidates:
        import json
        # No documents found at all
        yield f"data: {json.dumps({'done': True, 'answer': 'I could not find any relevant information in your documents. Please make sure you have uploaded and indexed documents before querying.', 'citations': []})}\n\n"
        return

    # ── Step 5: Rerank ────────────────────────────────────────────────────────
    reranked = rerank_candidates(
        query=query,
        candidates=all_candidates,
        top_k=RERANK_TOP_K,
    )
    logger.info("After reranking: %d candidates", len(reranked))

    # ── Step 6: Generate ──────────────────────────────────────────────────────
    yield from generate_answer_streaming(query=query, chunks=reranked, notes=notes)
