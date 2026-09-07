"""
app.py — BusinessOS backend.
Auto-starts Gmail polling on boot for any user who has connected Gmail.
"""
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_database
from creatives.routes import router as creatives_router
from rag.routes import router as rag_router, cleanup_stuck_documents, check_jina_key
from itinerary.routes import router as itinerary_router
from itinerary.supplier_routes import router as suppliers_router
from gmail.routes import router as gmail_router
from gmail.ingestion import start_auto_poll
from supabase_client import supabase

logger = logging.getLogger(__name__)


def _resume_auto_poll() -> None:
    """
    On startup, find any users who have Gmail connected and restart
    their auto-poll thread. This way polling survives server restarts.
    """
    try:
        result = (
            supabase.table("gmail_tokens")
            .select("user_id, gmail_email")
            .eq("connected", True)
            .execute()
        )
        users = result.data or []
        for row in users:
            uid = row["user_id"]
            email = row.get("gmail_email", "?")
            logger.info("Resuming Gmail auto-poll for %s (%s)", uid, email)
            start_auto_poll(uid)
    except Exception as e:
        logger.warning("Could not resume Gmail auto-poll on startup: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\nStarting BusinessOS backend...")
    init_database()
    check_jina_key()
    cleanup_stuck_documents()
    _resume_auto_poll()          # ← auto-start Gmail polling for connected users
    yield
    print("Stopping BusinessOS backend...")


app = FastAPI(title="BusinessOS", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(creatives_router, prefix="/api")
app.include_router(rag_router,        prefix="/api/rag")
app.include_router(itinerary_router,  prefix="/api/itinerary")
app.include_router(suppliers_router,  prefix="/api/suppliers")
app.include_router(gmail_router,      prefix="/api/gmail")

outputs_dir = Path("outputs")
outputs_dir.mkdir(exist_ok=True)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


@app.get("/")
def root():
    return {"status": "running", "service": "BusinessOS"}
