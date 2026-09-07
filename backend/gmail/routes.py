"""
Gmail integration API routes — mounted at /api/gmail/...

Auto-polling starts immediately when Gmail is connected.
No manual sync needed — emails are fetched every 10 minutes automatically.
"""
import json
import logging
import os
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
from .ingestion import (
    run_ingestion, start_auto_poll, stop_auto_poll,
    get_auto_poll_status, _latest_result, _sync_log,
)

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://businessos-roan-iota.vercel.app")

# In-memory manual sync jobs (for on-demand syncs in addition to auto-poll)
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
    user_id = _get_user_id(authorization)

    if not GOOGLE_CLIENT_ID:
        return {
            "connected": False,
            "configured": False,
            "message": "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
        }

    tokens = get_tokens(user_id)
    if not tokens or not tokens.get("connected"):
        return {"connected": False, "configured": True, "gmail_email": None}

    poll_status = get_auto_poll_status()
    return {
        "connected":    True,
        "configured":   True,
        "gmail_email":  tokens.get("gmail_email"),
        "auto_polling": poll_status["running"],
        "is_syncing":   poll_status["is_syncing"],
        "interval_min": poll_status["interval_s"] // 60,
        "latest":       poll_status["latest"],
    }


@router.get("/live-log")
def live_log(authorization: Optional[str] = Header(None)):
    """Return the latest sync log lines — frontend polls this for live updates."""
    _get_user_id(authorization)
    poll = get_auto_poll_status()
    return {
        "is_syncing": poll["is_syncing"],
        "log":        poll["log"],
        "latest":     poll["latest"],
    }


# ── OAuth flow ────────────────────────────────────────────────────────────────

@router.get("/oauth/url")
def get_oauth_url(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    return {"url": get_auth_url(state=user_id)}


@router.get("/oauth/callback")
def oauth_callback(
    code: str = Query(...),
    state: str = Query(""),
    error: str = Query(None),
):
    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_error={error}")

    user_id = state
    if not user_id:
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_error=missing_state")

    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("No access token in response")

        gmail_email = get_gmail_user_email(access_token)
        save_tokens(user_id, tokens, gmail_email)
        logger.info("Gmail connected for user %s: %s", user_id, gmail_email)

        # Start auto-polling immediately after connect
        start_auto_poll(user_id)

        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_connected=1")

    except Exception as e:
        logger.error("OAuth callback failed: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_error={str(e)[:100]}")


# ── Auto-poll control ─────────────────────────────────────────────────────────

@router.post("/start-polling")
def start_polling(authorization: Optional[str] = Header(None)):
    """Explicitly start auto-polling (called on app boot if already connected)."""
    user_id = _get_user_id(authorization)
    access_token = get_valid_access_token(user_id)
    if not access_token:
        raise HTTPException(status_code=400, detail="Gmail not connected")
    start_auto_poll(user_id)
    return {"success": True, "message": "Auto-polling started"}


@router.post("/stop-polling")
def stop_polling(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    stop_auto_poll()
    return {"success": True, "message": "Auto-polling stopped"}


# ── Manual trigger (in addition to auto-poll) ─────────────────────────────────

@router.post("/sync-now")
def sync_now(
    authorization: Optional[str] = Header(None),
    max_emails: int = Query(50, ge=1, le=200),
):
    """Trigger an immediate sync (runs alongside auto-poll, not instead of it)."""
    user_id = _get_user_id(authorization)
    access_token = get_valid_access_token(user_id)
    if not access_token:
        raise HTTPException(status_code=400, detail="Gmail not connected")

    job_id = str(uuid.uuid4())
    sync_jobs[job_id] = {"status": "running", "progress": "Starting...", "log": [], "result": None}

    def _run():
        log_lines = []
        def _upd(msg: str):
            log_lines.append(msg)
            sync_jobs[job_id]["progress"] = msg
            sync_jobs[job_id]["log"] = log_lines[-30:]

        try:
            result = run_ingestion(user_id, max_emails=max_emails, status_callback=_upd)
            sync_jobs[job_id]["status"] = "done"
            sync_jobs[job_id]["result"] = result.to_dict()
        except Exception as e:
            sync_jobs[job_id]["status"] = "error"
            sync_jobs[job_id]["progress"] = str(e)

    threading.Thread(target=_run, daemon=True).start()
    return {"success": True, "job_id": job_id}


@router.get("/sync/status/{job_id}")
def sync_status(job_id: str):
    job = sync_jobs.get(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}
    return {"success": True, **job}


# ── Disconnect ────────────────────────────────────────────────────────────────

@router.post("/disconnect")
def gmail_disconnect(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    stop_auto_poll()
    disconnect(user_id)
    return {"success": True, "message": "Gmail disconnected and auto-polling stopped"}


# ── Processed emails log ──────────────────────────────────────────────────────

@router.get("/processed")
def list_processed(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("gmail_processed_emails")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        return {"success": True, "emails": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
