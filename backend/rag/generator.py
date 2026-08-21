"""
Answer generator — builds a grounded context from retrieved chunks
and streams the answer from Nemotron 3 Ultra via OpenRouter.
"""
import json
import logging
import requests
from typing import Generator

from .config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    GENERATION_MODEL,
    GENERATION_CONTEXT_K,
)

logger = logging.getLogger(__name__)

CHAT_ENDPOINT = f"{OPENROUTER_BASE_URL}/chat/completions"

SYSTEM_PROMPT = """You are a precise document-grounded AI assistant.

Your job is to answer the user's question using ONLY the retrieved document context provided below.
The context may include PDF documents, plain text files, DOCX files, or source code files from ZIP archives.

Rules you must follow:
- Answer only from information present in the retrieved context.
- If the context does not contain enough information to answer, say so clearly — do NOT invent facts.
- For documents: cite as [Filename, p.X] where X is the page number.
- For code files: cite as [path/to/file.ext] — use the file path, not a page number.
- Prefer precise, specific answers. For code questions, include relevant code snippets in your answer.
- Use markdown formatting (headers, bullet points, code blocks) to structure answers.
- Do NOT mention that you are using "retrieved context" or "chunks" — answer naturally.
- Do NOT fabricate citations, file paths, or document names.

Respond with ONLY a JSON object in this exact shape:
{
  "answer": "<your full markdown answer — use ```lang code blocks for code>",
  "citations": [
    {"source": "pdf", "title": "<filename or file path>", "snippet": "<short verbatim excerpt>", "page": <page_number or 0>}
  ]
}

Rules for citations:
- Only cite sources that directly support a claim in your answer.
- "snippet" must be a short verbatim excerpt (1-3 lines max) from the retrieved content.
- "page" is the page number for documents; use 0 for code files (title shows the path).
- "source" should be "pdf" for documents, "pdf" for code files from zips (the UI handles display).
- Do NOT wrap the JSON in a code fence. Output raw JSON only.
- Do NOT add any text before or after the JSON object.
"""


def _build_context(chunks: list[dict], max_chunks: int = GENERATION_CONTEXT_K) -> str:
    """Format retrieved chunks into a clean context block."""
    context_parts = []
    seen_ids = set()

    for chunk in chunks[:max_chunks]:
        cid = chunk.get("id", "")
        if cid in seen_ids:
            continue
        seen_ids.add(cid)

        filename = chunk.get("filename", "Unknown document")
        page = chunk.get("page_number", 0)
        text = chunk.get("text", "").strip()
        source_type = chunk.get("source_type", "text")

        if source_type == "visual" and not text:
            part = f"--- Visual Evidence ---\nDocument: {filename}\nPage: {page}\n[Page image retrieved — visual content present]\n"
        else:
            part = f"--- Retrieved Passage ---\nDocument: {filename}\nPage: {page}\n\n{text}\n"

        context_parts.append(part)

    return "\n".join(context_parts)


def generate_answer_streaming(
    query: str,
    chunks: list[dict],
    notes: str = "",
) -> Generator[str, None, None]:
    """
    Stream SSE tokens from Nemotron Ultra, then yield a final
    data: {"done": true, "answer": "...", "citations": [...]} event.

    Yields SSE-formatted strings suitable for FastAPI StreamingResponse.
    """
    context = _build_context(chunks)

    if not context.strip():
        final = {
            "done": True,
            "answer": "I could not find any relevant information in your documents to answer this question.",
            "citations": [],
        }
        yield f"data: {json.dumps(final)}\n\n"
        return

    user_content = f"Question: {query}"
    if notes.strip():
        user_content += f"\n\nAdditional context: {notes}"
    user_content += f"\n\n===== RETRIEVED DOCUMENT CONTEXT =====\n{context}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    full_content = ""

    try:
        with requests.post(
            CHAT_ENDPOINT,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GENERATION_MODEL,
                "messages": messages,
                "stream": True,
            },
            stream=True,
            timeout=300,
        ) as resp:
            resp.raise_for_status()

            for line in resp.iter_lines():
                if not line:
                    continue
                decoded = line.decode("utf-8")
                if decoded.startswith("data: "):
                    decoded = decoded[6:]
                if decoded.strip() == "[DONE]":
                    break
                try:
                    chunk_data = json.loads(decoded)
                except Exception:
                    continue

                token = (
                    chunk_data.get("choices", [{}])[0]
                    .get("delta", {})
                    .get("content") or ""
                )
                if token:
                    full_content += token
                    yield f"data: {json.dumps({'raw_token': token})}\n\n"

                finish_reason = chunk_data.get("choices", [{}])[0].get("finish_reason")
                if finish_reason:
                    break

    except Exception as e:
        error_msg = f"Generation failed: {e}"
        logger.error(error_msg)
        yield f"data: {json.dumps({'error': error_msg})}\n\n"
        return

    # ── Parse the completed JSON response ────────────────────────────────────
    answer_text = ""
    citations = []

    # Strip <think>...</think> blocks if present (Nemotron reasoning models)
    import re
    cleaned = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL).strip()

    # Strip markdown code fences if model wrapped output
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned).strip()
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        parsed = json.loads(cleaned)
        answer_text = str(parsed.get("answer", "")).strip()
        raw_cits = parsed.get("citations", [])
        if isinstance(raw_cits, list):
            for c in raw_cits:
                if isinstance(c, dict):
                    src = c.get("source", "pdf")
                    if src not in ("pdf", "email", "web"):
                        src = "pdf"
                    citations.append({
                        "source": src,
                        "title": str(c.get("title", "")).strip(),
                        "snippet": str(c.get("snippet", "")).strip(),
                        "page": int(c.get("page", 0)),
                    })
    except Exception:
        # If JSON parsing fails, use the raw text as the answer
        answer_text = cleaned
        logger.warning("Could not parse generation JSON response; using raw text")

    if not answer_text:
        answer_text = "Sorry, I could not generate a valid response. Please try again."

    yield f"data: {json.dumps({'done': True, 'answer': answer_text, 'citations': citations})}\n\n"
