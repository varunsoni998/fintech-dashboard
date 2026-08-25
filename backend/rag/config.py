import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# ── OpenRouter (generation + reranker only) ───────────────────────────────────
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# ── Jina AI (embeddings) ──────────────────────────────────────────────────────
# Free tier: 1M tokens/month, no credit card.
# Get key at: https://jina.ai/?sui=apikey  (takes ~10 seconds)
# Add to backend/.env:  JINA_API_KEY=jina_...
JINA_API_KEY: str = os.getenv("JINA_API_KEY", "")
JINA_EMBED_URL = "https://api.jina.ai/v1/embeddings"

# jina-embeddings-v3: 1024-dim, multilingual, retrieval-optimised, free tier
TEXT_EMBED_MODEL = "jina-embeddings-v3"
TEXT_EMBED_DIM   = 1024

# ── Reranker (OpenRouter, free) ───────────────────────────────────────────────
RERANK_MODEL = "nvidia/llama-nemotron-rerank-vl-1b-v2:free"

# ── Generation (OpenRouter, free) ────────────────────────────────────────────
GENERATION_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE_TOKENS    = 600
CHUNK_OVERLAP_TOKENS = 100
APPROX_CHARS_PER_TOKEN = 4
CHUNK_SIZE_CHARS    = CHUNK_SIZE_TOKENS * APPROX_CHARS_PER_TOKEN
CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN

# ── Retrieval ─────────────────────────────────────────────────────────────────
TEXT_RETRIEVAL_TOP_K = 20
VL_RETRIEVAL_TOP_K   = 10
RERANK_TOP_K         = 8
GENERATION_CONTEXT_K = 6

# ── File storage ──────────────────────────────────────────────────────────────
UPLOAD_DIR = BASE_DIR / "outputs" / "rag_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
