"""
Gmail OAuth2 flow.

Uses Google's OAuth2 with offline access so the backend can poll Gmail
without the user being present. Tokens are stored in Supabase so they
persist across server restarts.

Setup:
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (type: Web application)
3. Add redirect URI: http://localhost:8000/api/gmail/oauth/callback
   (or your production URL)
4. Download credentials and add to .env:
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GMAIL_REDIRECT_URI=http://localhost:8000/api/gmail/oauth/callback
"""
import os
import json
import logging
from urllib.parse import urlencode, urlparse, parse_qs
from typing import Optional

import requests
from supabase_client import supabase

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GMAIL_REDIRECT_URI   = os.getenv("GMAIL_REDIRECT_URI", "http://localhost:8000/api/gmail/oauth/callback")

GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_URL= "https://oauth2.googleapis.com/revoke"

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
]

# Supabase table for storing OAuth tokens
TOKENS_TABLE = "gmail_tokens"


def get_auth_url(state: str = "") -> str:
    """Generate the Google OAuth2 authorization URL."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(GMAIL_SCOPES),
        "access_type":   "offline",
        "prompt":        "consent",   # always get refresh token
        "state":         state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "code":          code,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri":  GMAIL_REDIRECT_URI,
        "grant_type":    "authorization_code",
    })
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    """Get a new access token using the refresh token."""
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type":    "refresh_token",
    })
    resp.raise_for_status()
    return resp.json()


def get_gmail_user_email(access_token: str) -> str:
    """Get the Gmail account email address."""
    resp = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    resp.raise_for_status()
    return resp.json().get("email", "unknown")


def save_tokens(user_id: str, tokens: dict, gmail_email: str) -> None:
    """Persist OAuth tokens to Supabase."""
    row = {
        "user_id":       user_id,
        "gmail_email":   gmail_email,
        "access_token":  tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
        "expires_in":    tokens.get("expires_in"),
        "token_type":    tokens.get("token_type", "Bearer"),
        "scope":         tokens.get("scope", ""),
        "connected":     True,
    }
    # Upsert by user_id
    existing = supabase.table(TOKENS_TABLE).select("id").eq("user_id", user_id).execute()
    if existing.data:
        supabase.table(TOKENS_TABLE).update(row).eq("user_id", user_id).execute()
    else:
        supabase.table(TOKENS_TABLE).insert(row).execute()


def get_tokens(user_id: str) -> Optional[dict]:
    """Retrieve stored tokens for a user."""
    result = supabase.table(TOKENS_TABLE).select("*").eq("user_id", user_id).execute()
    return result.data[0] if result.data else None


def get_valid_access_token(user_id: str) -> Optional[str]:
    """
    Get a valid access token, refreshing if necessary.
    Returns None if no tokens are stored.
    """
    tokens = get_tokens(user_id)
    if not tokens:
        return None

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return None

    try:
        new_tokens = refresh_access_token(refresh_token)
        access_token = new_tokens.get("access_token")
        if access_token:
            # Update stored access token
            supabase.table(TOKENS_TABLE).update({
                "access_token": access_token,
                "expires_in": new_tokens.get("expires_in"),
            }).eq("user_id", user_id).execute()
            return access_token
    except Exception as e:
        logger.error("Token refresh failed for user %s: %s", user_id, e)

    return None


def disconnect(user_id: str) -> None:
    """Revoke and delete stored tokens."""
    tokens = get_tokens(user_id)
    if tokens:
        try:
            requests.post(GOOGLE_REVOKE_URL, params={"token": tokens.get("access_token")})
        except Exception:
            pass
        supabase.table(TOKENS_TABLE).update({"connected": False, "access_token": None, "refresh_token": None}).eq("user_id", user_id).execute()
