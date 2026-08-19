"""
Document processor — routes file types to the correct extractor,
chunks the text, generates embeddings, and stores everything in Supabase.
"""
import hashlib
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from supabase_client import supabase

from .chunker import chunk_page_text, chunk_document_text, Chunk
from .embeddings import embed_texts, embed_images_base64
from .pdf_processor import extract_pdf_pages, extract_pdf_text_only
from .config import UPLOAD_DIR

logger = logging.getLogger(__name__)


# ── File hash (deduplication) ─────────────────────────────────────────────────

def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _get_existing_doc(file_hash: str, user_id: str) -> Optional[dict]:
    """Return existing document record if this file was already indexed by this user."""
    try:
        result = (
            supabase.table("rag_documents")
            .select("*")
            .eq("file_hash", file_hash)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def _insert_document(
    document_id: str,
    user_id: str,
    filename: str,
    file_hash: str,
    page_count: int,
    chunk_count: int,
    file_type: str,
) -> dict:
    row = {
        "id": document_id,
        "user_id": user_id,
        "filename": filename,
        "file_hash": file_hash,
        "page_count": page_count,
        "chunk_count": chunk_count,
        "file_type": file_type,
        "status": "indexed",
    }
    result = supabase.table("rag_documents").insert(row).execute()
    return result.data[0]


def _insert_chunks(chunks: list[Chunk], embeddings: list[list[float]]) -> None:
    """Batch-insert text chunks with their embeddings."""
    rows = []
    for chunk, vec in zip(chunks, embeddings):
        rows.append({
            "id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "filename": chunk.filename,
            "page_number": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "text": chunk.text,
            "embedding": vec,   # stored as JSONB array
        })

    # Supabase has a max of 1000 rows per insert; batch if needed
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        supabase.table("rag_chunks").insert(rows[i : i + batch_size]).execute()


def _insert_visual_chunks(
    document_id: str,
    filename: str,
    page_numbers: list[int],
    image_b64s: list[str],
    embeddings: list[list[float]],
) -> None:
    """Store page-level visual embeddings."""
    rows = []
    for page_num, img_b64, vec in zip(page_numbers, image_b64s, embeddings):
        rows.append({
            "id": f"{document_id}_visual_p{page_num}",
            "document_id": document_id,
            "filename": filename,
            "page_number": page_num,
            "image_b64": img_b64[:500],  # store thumbnail preview only, not full image
            "embedding": vec,
        })

    batch_size = 50
    for i in range(0, len(rows), batch_size):
        supabase.table("rag_visual_chunks").insert(rows[i : i + batch_size]).execute()


# ── Main processing functions ─────────────────────────────────────────────────

def process_pdf(
    file_path: str,
    filename: str,
    user_id: str,
    enable_visual: bool = True,
    status_callback=None,
) -> dict:
    """
    Full PDF processing pipeline:
    1. Hash → check dedup
    2. Extract text + images per page
    3. Chunk text
    4. Generate text embeddings
    5. Generate visual embeddings (if enabled)
    6. Store in Supabase
    Returns the document record.
    """
    def _status(msg: str):
        if status_callback:
            status_callback(msg)
        logger.info("[PDF] %s", msg)

    _status("Hashing file...")
    file_hash = file_sha256(file_path)
    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status("Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())
    _status("Extracting text from pages...")

    pages = extract_pdf_pages(file_path, render_images=enable_visual)

    all_chunks: list[Chunk] = []
    visual_pages: list[int] = []
    visual_images: list[str] = []

    for page in pages:
        if page.text.strip():
            chunks = chunk_page_text(page.text, document_id, filename, page.page_number)
            all_chunks.extend(chunks)
        if enable_visual and page.image_b64:
            visual_pages.append(page.page_number)
            visual_images.append(page.image_b64)

    if not all_chunks:
        raise RuntimeError("No text could be extracted from the PDF.")

    _status(f"Generating text embeddings for {len(all_chunks)} chunks...")
    chunk_texts = [c.text for c in all_chunks]
    text_embeddings = embed_texts(chunk_texts)

    _status("Storing text vectors...")
    _insert_chunks(all_chunks, text_embeddings)

    if enable_visual and visual_images:
        _status(f"Generating visual embeddings for {len(visual_images)} pages...")
        try:
            vis_embeddings = embed_images_base64(visual_images)
            _status("Storing visual vectors...")
            _insert_visual_chunks(document_id, filename, visual_pages, visual_images, vis_embeddings)
        except Exception as e:
            # Visual embedding failure is non-fatal
            logger.warning("Visual embedding failed (continuing without it): %s", e)

    _status("Saving document record...")
    doc = _insert_document(
        document_id=document_id,
        user_id=user_id,
        filename=filename,
        file_hash=file_hash,
        page_count=len(pages),
        chunk_count=len(all_chunks),
        file_type="pdf",
    )

    _status("Done!")
    return doc


def process_txt(file_path: str, filename: str, user_id: str, status_callback=None) -> dict:
    """Process a plain text file."""
    def _status(msg: str):
        if status_callback:
            status_callback(msg)

    _status("Hashing file...")
    file_hash = file_sha256(file_path)
    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status("Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())
    _status("Reading text...")

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    if not text.strip():
        raise RuntimeError("Text file is empty.")

    _status("Chunking...")
    chunks = chunk_document_text(text, document_id, filename)

    _status(f"Generating embeddings for {len(chunks)} chunks...")
    embeddings = embed_texts([c.text for c in chunks])

    _status("Storing...")
    _insert_chunks(chunks, embeddings)

    doc = _insert_document(
        document_id=document_id,
        user_id=user_id,
        filename=filename,
        file_hash=file_hash,
        page_count=1,
        chunk_count=len(chunks),
        file_type="txt",
    )

    _status("Done!")
    return doc


def process_docx(file_path: str, filename: str, user_id: str, status_callback=None) -> dict:
    """Process a DOCX file using python-docx."""
    from docx import Document as DocxDocument

    def _status(msg: str):
        if status_callback:
            status_callback(msg)

    _status("Hashing file...")
    file_hash = file_sha256(file_path)
    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status("Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())
    _status("Reading DOCX...")

    doc = DocxDocument(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n\n".join(paragraphs)

    if not text.strip():
        raise RuntimeError("DOCX file has no extractable text.")

    _status("Chunking...")
    chunks = chunk_document_text(text, document_id, filename)

    _status(f"Generating embeddings for {len(chunks)} chunks...")
    embeddings = embed_texts([c.text for c in chunks])

    _status("Storing...")
    _insert_chunks(chunks, embeddings)

    doc_record = _insert_document(
        document_id=document_id,
        user_id=user_id,
        filename=filename,
        file_hash=file_hash,
        page_count=1,
        chunk_count=len(chunks),
        file_type="docx",
    )

    _status("Done!")
    return doc_record


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".docx", ".doc"}


def process_file(
    file_path: str,
    filename: str,
    user_id: str,
    status_callback=None,
) -> dict:
    """Route a file to the correct processor based on extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return process_pdf(file_path, filename, user_id, status_callback=status_callback)
    elif ext == ".txt":
        return process_txt(file_path, filename, user_id, status_callback=status_callback)
    elif ext in (".docx", ".doc"):
        return process_docx(file_path, filename, user_id, status_callback=status_callback)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: PDF, TXT, DOCX")
