"""
Gmail integration API routes.
Mounted at /api/gmail/...

Endpoints:
  GET  /api/gmail/status              — connection status + token info
  GET  /api/gmail/oauth/url           — get OAuth2 authorization URL
  GET  /api/gmail/oauth/callback      — OAuth2 callback (redirect from Google)
  POST /api/gmail/sync                — trigger manual sync (background)
  GET  /api/gmail/sync/status/{job}   — poll sync job progress
  POST /api/gmail/disconnect          — revoke tokens
  GET  /api/gmail/processed           — list processed emails
"""
import json
import logging
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import RedirectResponse

from supabase_client import supabase
from .auth import (
    get_auth_url, exchange_code_for_tokens, get_gmail_user_email,
    save_tokens, get_tokens, get_valid_access_token, disconnect,
    GOOGLE_CLIENT_ID,
)
from .ingestion import run_ingestion

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory sync job tracker
sync_jobs: dict[str, dict] = {}


def _get_user_id(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        resp = supabase.auth.get_user(token)
        if not resp or not resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return resp.user.id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
def gmail_status(authorization: Optional[str] = Header(None)):
    """Return Gmail connection status for the current user."""
    user_id = _get_user_id(authorization)

    if not GOOGLE_CLIENT_ID:
        return {
            "connected": False,
            "configured": False,
            "message": "Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
        }

    tokens = get_tokens(user_id)
    if not tokens or not tokens.get("connected"):
        return {"connected": False, "configured": True, "gmail_email": None}

    return {
        "connected": True,
        "configured": True,
        "gmail_email": tokens.get("gmail_email"),
    }


# ── OAuth flow ────────────────────────────────────────────────────────────────

@router.get("/oauth/url")
def get_oauth_url(authorization: Optional[str] = Header(None)):
    """Return the Google OAuth authorization URL."""
    user_id = _get_user_id(authorization)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    url = get_auth_url(state=user_id)
    return {"url": url}


@router.get("/oauth/callback")
def oauth_callback(
    code: str = Query(...),
    state: str = Query(""),
    error: str = Query(None),
):
    """
    Google OAuth2 callback.
    Exchanges code for tokens, stores them, redirects to frontend.
    """
    if error:
        return RedirectResponse(url=f"/itineraries?gmail_error={error}")

    user_id = state
    if not user_id:
        return RedirectResponse(url="/itineraries?gmail_error=missing_state")

    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("No access token in response")

        gmail_email = get_gmail_user_email(access_token)
        save_tokens(user_id, tokens, gmail_email)

        logger.info("Gmail connected for user %s: %s", user_id, gmail_email)
        return RedirectResponse(url="/itineraries?gmail_connected=1")

    except Exception as e:
        logger.error("OAuth callback failed: %s", e)
        return RedirectResponse(url=f"/itineraries?gmail_error={str(e)[:100]}")


# ── Manual sync ───────────────────────────────────────────────────────────────

@router.post("/sync")
def trigger_sync(
    authorization: Optional[str] = Header(None),
    max_emails: int = Query(20, ge=1, le=100),
):
    """Trigger a manual Gmail sync in a background thread."""
    user_id = _get_user_id(authorization)

    access_token = get_valid_access_token(user_id)
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Gmail not connected. Please connect your Gmail account first.",
        )

    job_id = str(uuid.uuid4())
    sync_jobs[job_id] = {
        "status": "running",
        "progress": "Starting sync...",
        "log": [],
        "result": None,
    }

    def _run():
        log_lines = []

        def _update(msg: str):
            log_lines.append(msg)
            sync_jobs[job_id]["progress"] = msg
            sync_jobs[job_id]["log"] = log_lines[-30:]

        try:
            result = run_ingestion(user_id, max_emails=max_emails, status_callback=_update)
            sync_jobs[job_id]["status"] = "done"
            sync_jobs[job_id]["result"] = result.to_dict()
            sync_jobs[job_id]["log"] = result.log[-50:]
            sync_jobs[job_id]["progress"] = (
                f"Done — {result.hotels_added} hotels, "
                f"{result.activities_added} activities, "
                f"{result.transfers_added} transfers added"
            )
        except Exception as e:
            logger.error("Sync job failed: %s", e)
            sync_jobs[job_id]["status"] = "error"
            sync_jobs[job_id]["progress"] = f"Error: {e}"

    threading.Thread(target=_run, daemon=True).start()

    return {"success": True, "job_id": job_id}


@router.get("/sync/status/{job_id}")
def sync_status(job_id: str):
    """Poll the status of a sync job."""
    job = sync_jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {"success": True, **job}


# ── Disconnect ────────────────────────────────────────────────────────────────

@router.post("/disconnect")
def gmail_disconnect(authorization: Optional[str] = Header(None)):
    """Revoke Gmail access and delete stored tokens."""
    user_id = _get_user_id(authorization)
    disconnect(user_id)
    return {"success": True, "message": "Gmail disconnected"}


# ── Processed emails log ──────────────────────────────────────────────────────

@router.get("/processed")
def list_processed(authorization: Optional[str] = Header(None)):
    """List recently processed Gmail messages."""
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("gmail_processed_emails")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"success": True, "emails": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
