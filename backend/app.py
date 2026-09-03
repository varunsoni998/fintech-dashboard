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


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\nStarting BusinessOS backend...")
    init_database()
    check_jina_key()
    cleanup_stuck_documents()
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
