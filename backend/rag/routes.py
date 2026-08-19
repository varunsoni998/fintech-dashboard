"""
RAG API routes — mounted at /api/rag/...

Endpoints:
  POST /api/rag/upload          — upload + index a document
  POST /api/rag/query           — streaming RAG query (SSE)
  GET  /api/rag/documents       — list user's indexed documents
  DELETE /api/rag/documents/{id} — delete a document + its vectors
  GET  /api/rag/status/{job_id} — poll background indexing job status
"""
import json
import os
import threading
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from supabase_client import supabase
from .document_processor import process_file, SUPPORTED_EXTENSIONS
from .pipeline import run_rag_query
from .config import UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory job store for background indexing progress
indexing_jobs: dict[str, dict] = {}


# ── Auth helper ───────────────────────────────────────────────────────────────

def _get_user_id(authorization: Optional[str]) -> str:
    """
    Extract and verify the Supabase JWT from the Authorization header.
    Returns the user's UUID string.
    Raises HTTPException 401 if missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]
    try:
        user_resp = supabase.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user_resp.user.id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


# ── Upload endpoint ───────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    """
    Upload and index a document (PDF, TXT, DOCX).
    Runs indexing in a background thread; returns a job_id to poll.
    """
    user_id = _get_user_id(authorization)

    # Validate file type
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{ext}'. Supported: PDF, TXT, DOCX",
        )

    # Save to disk
    save_path = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")
        with open(save_path, "wb") as f:
            f.write(contents)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Create a job
    job_id = str(uuid.uuid4())
    indexing_jobs[job_id] = {
        "status": "processing",
        "filename": filename,
        "progress": "Starting...",
        "document_id": None,
        "error": None,
    }

    def _run():
        def _update(msg: str):
            indexing_jobs[job_id]["progress"] = msg

        try:
            doc = process_file(
                file_path=str(save_path),
                filename=filename,
                user_id=user_id,
                status_callback=_update,
            )
            indexing_jobs[job_id]["status"] = "done"
            indexing_jobs[job_id]["document_id"] = doc.get("id")
            indexing_jobs[job_id]["progress"] = "Indexed"
        except Exception as e:
            logger.error("Indexing failed for %s: %s", filename, e)
            indexing_jobs[job_id]["status"] = "error"
            indexing_jobs[job_id]["error"] = str(e)
        finally:
            # Clean up temp file
            try:
                os.remove(save_path)
            except Exception:
                pass

    threading.Thread(target=_run, daemon=True).start()

    return {
        "success": True,
        "job_id": job_id,
        "filename": filename,
        "message": "File uploaded — indexing in progress. Poll /api/rag/status/{job_id}",
    }


@router.get("/status/{job_id}")
def indexing_status(job_id: str):
    """Poll the status of a background indexing job."""
    job = indexing_jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {"success": True, **job}


# ── Query endpoint ────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str
    notes: str = ""
    sources: list[str] = ["pdf"]
    document_ids: Optional[list[str]] = None


@router.post("/query")
async def rag_query(
    payload: QueryRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Streaming RAG query.
    Yields SSE: raw tokens while generating, then a final done event.
    """
    user_id = _get_user_id(authorization)

    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=422, detail="query is required")

    def _stream():
        try:
            yield from run_rag_query(
                query=query,
                user_id=user_id,
                notes=payload.notes,
                sources=payload.sources,
                document_ids=payload.document_ids,
            )
        except Exception as e:
            logger.error("RAG query pipeline error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── Document management ───────────────────────────────────────────────────────

@router.get("/documents")
def list_documents(authorization: Optional[str] = Header(None)):
    """List all documents indexed by the current user."""
    user_id = _get_user_id(authorization)

    try:
        result = (
            supabase.table("rag_documents")
            .select("id, filename, file_type, page_count, chunk_count, status, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"success": True, "documents": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not list documents: {e}")


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, authorization: Optional[str] = Header(None)):
    """
    Delete a document and all its associated vectors (text + visual).
    Enforces ownership — users can only delete their own documents.
    """
    user_id = _get_user_id(authorization)

    # Verify ownership
    try:
        result = (
            supabase.table("rag_documents")
            .select("id, user_id")
            .eq("id", document_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        if result.data["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lookup failed: {e}")

    # Delete chunks (text)
    try:
        supabase.table("rag_chunks").delete().eq("document_id", document_id).execute()
    except Exception as e:
        logger.warning("Could not delete text chunks for %s: %s", document_id, e)

    # Delete visual chunks
    try:
        supabase.table("rag_visual_chunks").delete().eq("document_id", document_id).execute()
    except Exception as e:
        logger.warning("Could not delete visual chunks for %s: %s", document_id, e)

    # Delete document record
    try:
        supabase.table("rag_documents").delete().eq("id", document_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not delete document: {e}")

    return {"success": True, "deleted_id": document_id}
