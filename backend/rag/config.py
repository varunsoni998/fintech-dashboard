import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# ── OpenRouter ────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Model IDs
TEXT_EMBED_MODEL  = "nvidia/nemotron-3-embed-1b:free"
VL_EMBED_MODEL    = "nvidia/llama-nemotron-embed-vl-1b-v2:free"
RERANK_MODEL      = "nvidia/llama-nemotron-rerank-vl-1b-v2:free"
GENERATION_MODEL  = "nvidia/nemotron-3-ultra-550b-a55b:free"

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE_TOKENS  = 600    # target tokens per chunk
CHUNK_OVERLAP_TOKENS = 100  # overlap between adjacent chunks
APPROX_CHARS_PER_TOKEN = 4  # rough estimate to avoid needing tiktoken

CHUNK_SIZE_CHARS   = CHUNK_SIZE_TOKENS * APPROX_CHARS_PER_TOKEN   # 2400
CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN  # 400

# ── Retrieval ─────────────────────────────────────────────────────────────────
TEXT_RETRIEVAL_TOP_K  = 20   # candidates before reranking
VL_RETRIEVAL_TOP_K    = 10   # visual candidates
RERANK_TOP_K          = 8    # keep after reranking
GENERATION_CONTEXT_K  = 6    # max chunks fed to generation model

# ── File storage ──────────────────────────────────────────────────────────────
UPLOAD_DIR = BASE_DIR / "outputs" / "rag_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
