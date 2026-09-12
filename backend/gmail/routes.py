"""
Gmail integration routes — /api/gmail/...

Polling strategy: Instead of relying on a background thread (which dies
when Render's free tier spins down), the frontend sends a heartbeat ping
every 5 minutes. Each ping triggers ingestion if enough time has passed.
This is reliable across server restarts and sleep cycles.
"""
import json
import logging
import os
import threading
import time
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
from .ingestion import run_ingestion, get_auto_poll_status, _latest_result, _sync_log
from .fetcher import delete_processed

logger = logging.getLogger(__name__)
router = APIRouter()

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://businessos-roan-iota.vercel.app")
POLL_INTERVAL_SECONDS = 600   # 10 minutes between auto-syncs

# Per-user last sync timestamps
_last_sync: dict[str, float] = {}
_sync_locks: dict[str, threading.Lock] = {}
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


# ── Status ─────────────────────────────────────────────────────────────────────

@router.get("/status")
def gmail_status(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)

    if not GOOGLE_CLIENT_ID:
        return {"connected": False, "configured": False,
                "message": "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"}

    tokens = get_tokens(user_id)
    if not tokens or not tokens.get("connected"):
        return {"connected": False, "configured": True, "gmail_email": None}

    poll = get_auto_poll_status()
    last = _last_sync.get(user_id, 0)
    secs_since = int(time.time() - last) if last else None
    next_in = max(0, POLL_INTERVAL_SECONDS - (time.time() - last)) if last else 0

    return {
        "connected":    True,
        "configured":   True,
        "gmail_email":  tokens.get("gmail_email"),
        "auto_polling": True,   # always true — heartbeat-based
        "is_syncing":   poll["is_syncing"],
        "interval_min": POLL_INTERVAL_SECONDS // 60,
        "secs_since_last_sync": secs_since,
        "next_sync_in_secs": int(next_in),
        "latest":       poll["latest"],
    }


@router.get("/live-log")
def live_log(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    poll = get_auto_poll_status()
    return {
        "is_syncing": poll["is_syncing"],
        "log":        poll["log"],
        "latest":     poll["latest"],
    }


# ── Heartbeat — frontend calls this every 5 min ────────────────────────────────

@router.post("/heartbeat")
def heartbeat(authorization: Optional[str] = Header(None)):
    """
    Called by the frontend every 5 minutes while the page is open.
    Triggers ingestion if POLL_INTERVAL_SECONDS have passed since last sync.
    This replaces the background thread approach which breaks on Render free tier.
    """
    user_id = _get_user_id(authorization)

    access_token = get_valid_access_token(user_id)
    if not access_token:
        return {"synced": False, "reason": "no_token"}

    now = time.time()
    last = _last_sync.get(user_id, 0)

    if now - last < POLL_INTERVAL_SECONDS:
        remaining = int(POLL_INTERVAL_SECONDS - (now - last))
        return {"synced": False, "reason": "too_soon", "next_in_secs": remaining}

    # Avoid double-runs if two heartbeats arrive simultaneously
    lock = _sync_locks.setdefault(user_id, threading.Lock())
    if not lock.acquire(blocking=False):
        return {"synced": False, "reason": "already_running"}

    _last_sync[user_id] = now

    def _run():
        try:
            run_ingestion(user_id, max_emails=50)
        finally:
            lock.release()

    threading.Thread(target=_run, daemon=True).start()
    return {"synced": True, "message": "Ingestion started"}


# ── OAuth ──────────────────────────────────────────────────────────────────────

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
    if not state:
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_error=missing_state")
    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("No access token")
        gmail_email = get_gmail_user_email(access_token)
        save_tokens(state, tokens, gmail_email)
        logger.info("Gmail connected for user %s: %s", state, gmail_email)
        # Trigger first sync immediately
        _last_sync[state] = 0
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_connected=1")
    except Exception as e:
        logger.error("OAuth callback failed: %s", e)
        return RedirectResponse(url=f"{FRONTEND_URL}/knowledge-base?gmail_error={str(e)[:100]}")


# ── Manual sync ────────────────────────────────────────────────────────────────

@router.post("/sync-now")
def sync_now(
    authorization: Optional[str] = Header(None),
    max_emails: int = Query(50, ge=1, le=200),
):
    user_id = _get_user_id(authorization)
    access_token = get_valid_access_token(user_id)
    if not access_token:
        raise HTTPException(status_code=400, detail="Gmail not connected")

    job_id = str(uuid.uuid4())
    sync_jobs[job_id] = {"status": "running", "progress": "Starting...", "log": [], "result": None}
    _last_sync[user_id] = time.time()

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


# ── Keep-alive (legacy compat) ─────────────────────────────────────────────────

@router.post("/start-polling")
def start_polling(authorization: Optional[str] = Header(None)):
    """Resets the last-sync timer so the next heartbeat triggers immediately."""
    user_id = _get_user_id(authorization)
    _last_sync[user_id] = 0
    return {"success": True, "message": "Next heartbeat will trigger sync"}


@router.post("/stop-polling")
def stop_polling(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return {"success": True, "message": "Polling is heartbeat-based; it stops when the page is closed"}


# ── Disconnect ────────────────────────────────────────────────────────────────

@router.post("/disconnect")
def gmail_disconnect(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    _last_sync.pop(user_id, None)
    disconnect(user_id)
    return {"success": True, "message": "Gmail disconnected"}


# ── Processed emails ──────────────────────────────────────────────────────────

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


@router.delete("/processed/{message_id}")
def delete_processed_email(message_id: str, authorization: Optional[str] = Header(None)):
    """
    Remove a processed email record so it will be re-processed on next sync.
    Useful for re-extracting data from an email that was previously missed.
    """
    user_id = _get_user_id(authorization)
    try:
        delete_processed(message_id, user_id)
        return {"success": True, "message_id": message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/processed")
def clear_processed(authorization: Optional[str] = Header(None)):
    """Clear ALL processed email records for this user — forces full re-scan."""
    user_id = _get_user_id(authorization)
    try:
        supabase.table("gmail_processed_emails").delete().eq("user_id", user_id).execute()
        _last_sync[user_id] = 0   # trigger immediate re-sync
        return {"success": True, "message": "All records cleared — next sync will re-process everything"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
