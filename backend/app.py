from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_database
from creatives.routes import router as creatives_router
from rag.routes import router as rag_router

import threading
import time
import requests


def keep_alive():
    """Ping self every 10 minutes to prevent Render free tier spindown"""
    time.sleep(60)
    while True:
        try:
            requests.get("https://businessos-roan-iota.onrender.com/api/health", timeout=10)
            print("[keep-alive] ping sent")
        except Exception as e:
            print(f"[keep-alive] failed: {e}")
        time.sleep(600)  # every 10 minutes

threading.Thread(target=keep_alive, daemon=True).start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\nStarting Custom Holiday AI backend...")
    init_database()
    yield
    print("Stopping Custom Holiday AI backend...")


app = FastAPI(
    title="Custom Holiday AI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(creatives_router, prefix="/api")
app.include_router(rag_router, prefix="/api/rag")

outputs_dir = Path("outputs")
outputs_dir.mkdir(exist_ok=True)

app.mount(
    "/outputs",
    StaticFiles(directory="outputs"),
    name="outputs",
)


@app.get("/")
def root():
    return {
        "status": "running",
        "service": "AI Travel Studio",
        "endpoints": {
            "storyboard": "/api/generate-full-storyboard",
            "video": "/api/generate-video",
            "rag_upload": "/api/rag/upload",
            "rag_query": "/api/rag/query",
            "rag_documents": "/api/rag/documents",
            "chat_messages": "/api/chat-messages",
        },
    }
