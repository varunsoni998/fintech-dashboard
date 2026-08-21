"""
Document processor — routes file types to the correct extractor,
chunks the text, generates embeddings, and stores everything in Supabase.

Fix: document record is inserted FIRST (status='processing'), then chunks,
then updated to status='indexed'. This satisfies the rag_chunks foreign key.
"""
import hashlib
import logging
import uuid
from pathlib import Path
from typing import Optional, Callable

from supabase_client import supabase

from .chunker import chunk_page_text, chunk_document_text, Chunk
from .embeddings import embed_texts, embed_images_base64
from .pdf_processor import extract_pdf_pages
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
    """Return existing document record if already indexed by this user."""
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


def _insert_document_placeholder(
    document_id: str,
    user_id: str,
    filename: str,
    file_hash: str,
    file_type: str,
) -> dict:
    """
    Insert the document row FIRST with status='processing'.
    This must happen before any chunks are inserted so the FK is satisfied.
    """
    row = {
        "id": document_id,
        "user_id": user_id,
        "filename": filename,
        "file_hash": file_hash,
        "file_type": file_type,
        "page_count": 0,
        "chunk_count": 0,
        "status": "processing",
    }
    result = supabase.table("rag_documents").insert(row).execute()
    return result.data[0]


def _update_document_indexed(
    document_id: str,
    page_count: int,
    chunk_count: int,
) -> None:
    """Update the document row after all chunks are stored."""
    supabase.table("rag_documents").update({
        "page_count": page_count,
        "chunk_count": chunk_count,
        "status": "indexed",
    }).eq("id", document_id).execute()


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
            "embedding": vec,
        })

    batch_size = 100
    for i in range(0, len(rows), batch_size):
        supabase.table("rag_chunks").insert(rows[i: i + batch_size]).execute()


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
            "image_b64": img_b64[:500],   # thumbnail preview only
            "embedding": vec,
        })

    batch_size = 50
    for i in range(0, len(rows), batch_size):
        supabase.table("rag_visual_chunks").insert(rows[i: i + batch_size]).execute()


# ── Main processing functions ─────────────────────────────────────────────────

StatusCB = Optional[Callable[[str], None]]


def _status(cb: StatusCB, msg: str) -> None:
    if cb:
        cb(msg)
    logger.info("[processor] %s", msg)


def process_pdf(
    file_path: str,
    filename: str,
    user_id: str,
    enable_visual: bool = True,
    status_callback: StatusCB = None,
) -> dict:
    """
    Full PDF processing pipeline — document record inserted FIRST.
    """
    _status(status_callback, "Hashing file...")
    file_hash = file_sha256(file_path)

    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status(status_callback, "Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())

    # ── INSERT DOCUMENT FIRST so FK constraint is satisfied ──────────────────
    _status(status_callback, "Creating document record...")
    _insert_document_placeholder(document_id, user_id, filename, file_hash, "pdf")

    try:
        _status(status_callback, "Extracting text from pages...")
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

        _status(status_callback, f"Generating text embeddings for {len(all_chunks)} chunks...")
        chunk_texts = [c.text for c in all_chunks]
        text_embeddings = embed_texts(chunk_texts)

        _status(status_callback, "Storing text vectors...")
        _insert_chunks(all_chunks, text_embeddings)

        if enable_visual and visual_images:
            _status(status_callback, f"Generating visual embeddings for {len(visual_images)} pages...")
            try:
                vis_embeddings = embed_images_base64(visual_images)
                _status(status_callback, "Storing visual vectors...")
                _insert_visual_chunks(document_id, filename, visual_pages, visual_images, vis_embeddings)
            except Exception as e:
                logger.warning("Visual embedding failed (continuing): %s", e)

        # ── UPDATE document row with final counts ─────────────────────────────
        _status(status_callback, "Finalising document record...")
        _update_document_indexed(document_id, len(pages), len(all_chunks))

        _status(status_callback, "Done!")

        # Return the final record
        result = supabase.table("rag_documents").select("*").eq("id", document_id).single().execute()
        return result.data

    except Exception as e:
        # Mark document as errored so it doesn't linger as 'processing'
        try:
            supabase.table("rag_documents").update({"status": "error"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise


def process_txt(
    file_path: str,
    filename: str,
    user_id: str,
    status_callback: StatusCB = None,
) -> dict:
    """Process a plain text file."""
    _status(status_callback, "Hashing file...")
    file_hash = file_sha256(file_path)

    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status(status_callback, "Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())

    _status(status_callback, "Creating document record...")
    _insert_document_placeholder(document_id, user_id, filename, file_hash, "txt")

    try:
        _status(status_callback, "Reading text...")
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

        if not text.strip():
            raise RuntimeError("Text file is empty.")

        _status(status_callback, "Chunking...")
        chunks = chunk_document_text(text, document_id, filename)

        _status(status_callback, f"Generating embeddings for {len(chunks)} chunks...")
        embeddings = embed_texts([c.text for c in chunks])

        _status(status_callback, "Storing...")
        _insert_chunks(chunks, embeddings)

        _status(status_callback, "Finalising...")
        _update_document_indexed(document_id, 1, len(chunks))

        _status(status_callback, "Done!")
        result = supabase.table("rag_documents").select("*").eq("id", document_id).single().execute()
        return result.data

    except Exception as e:
        try:
            supabase.table("rag_documents").update({"status": "error"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise


def process_docx(
    file_path: str,
    filename: str,
    user_id: str,
    status_callback: StatusCB = None,
) -> dict:
    """Process a DOCX file using python-docx."""
    from docx import Document as DocxDocument

    _status(status_callback, "Hashing file...")
    file_hash = file_sha256(file_path)

    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status(status_callback, "Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())

    _status(status_callback, "Creating document record...")
    _insert_document_placeholder(document_id, user_id, filename, file_hash, "docx")

    try:
        _status(status_callback, "Reading DOCX...")
        doc = DocxDocument(file_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n\n".join(paragraphs)

        if not text.strip():
            raise RuntimeError("DOCX file has no extractable text.")

        _status(status_callback, "Chunking...")
        chunks = chunk_document_text(text, document_id, filename)

        _status(status_callback, f"Generating embeddings for {len(chunks)} chunks...")
        embeddings = embed_texts([c.text for c in chunks])

        _status(status_callback, "Storing...")
        _insert_chunks(chunks, embeddings)

        _status(status_callback, "Finalising...")
        _update_document_indexed(document_id, 1, len(chunks))

        _status(status_callback, "Done!")
        result = supabase.table("rag_documents").select("*").eq("id", document_id).single().execute()
        return result.data

    except Exception as e:
        try:
            supabase.table("rag_documents").update({"status": "error"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".docx", ".doc", ".zip"}


def process_file(
    file_path: str,
    filename: str,
    user_id: str,
    status_callback: StatusCB = None,
) -> dict:
    """Route a file to the correct processor based on extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return process_pdf(file_path, filename, user_id, status_callback=status_callback)
    elif ext == ".txt":
        return process_txt(file_path, filename, user_id, status_callback=status_callback)
    elif ext in (".docx", ".doc"):
        return process_docx(file_path, filename, user_id, status_callback=status_callback)
    elif ext == ".zip":
        return process_zip(file_path, filename, user_id, status_callback=status_callback)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: PDF, TXT, DOCX, ZIP")


def process_zip(
    file_path: str,
    filename: str,
    user_id: str,
    status_callback: StatusCB = None,
) -> dict:
    """
    Process a ZIP archive — extracts all readable text/code files,
    chunks each one individually, embeds, and stores in Supabase.
    Each file path is preserved in chunk metadata for citations.
    """
    from .zip_processor import extract_zip_entries, format_entry_for_chunking

    _status(status_callback, "Hashing file...")
    file_hash = file_sha256(file_path)

    existing = _get_existing_doc(file_hash, user_id)
    if existing:
        _status(status_callback, "Already indexed (duplicate).")
        return existing

    document_id = str(uuid.uuid4())

    _status(status_callback, "Creating document record...")
    _insert_document_placeholder(document_id, user_id, filename, file_hash, "zip")

    try:
        _status(status_callback, "Extracting files from zip...")
        entries, stats = extract_zip_entries(file_path)

        if not entries:
            raise RuntimeError(
                f"No readable text/code files found in zip. "
                f"({stats['total']} total files, "
                f"{stats['skipped_type']} skipped as binary/unknown, "
                f"{stats['skipped_pattern']} skipped as node_modules/.git/etc.)"
            )

        _status(status_callback, f"Found {stats['extracted']} readable files — chunking...")

        # Chunk each file individually so citations show the correct file path
        all_chunks: list[Chunk] = []
        for i, entry in enumerate(entries):
            # Use file path as the "page" label — store index as page_number
            # and the relative_path in filename field for this chunk set
            formatted = format_entry_for_chunking(entry)
            file_chunks = chunk_page_text(
                text=formatted,
                document_id=document_id,
                filename=entry.relative_path,   # actual file path inside zip
                page_number=i + 1,              # file index (1-based)
            )
            all_chunks.extend(file_chunks)

        if not all_chunks:
            raise RuntimeError("All files in the zip were empty after extraction.")

        _status(status_callback, f"Generating embeddings for {len(all_chunks)} chunks across {len(entries)} files...")
        embeddings = embed_texts([c.text for c in all_chunks])

        _status(status_callback, "Storing vectors...")
        _insert_chunks(all_chunks, embeddings)

        _status(status_callback, "Finalising...")
        _update_document_indexed(document_id, len(entries), len(all_chunks))

        _status(status_callback, f"Done! Indexed {len(entries)} files, {len(all_chunks)} chunks.")

        result = supabase.table("rag_documents").select("*").eq("id", document_id).single().execute()
        return result.data

    except Exception as e:
        try:
            supabase.table("rag_documents").update({"status": "error"}).eq("id", document_id).execute()
        except Exception:
            pass
        raise
