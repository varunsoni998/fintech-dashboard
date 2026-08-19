"""
Text chunking — splits document text into overlapping chunks.
Uses character-based splitting (no tiktoken needed).
"""
import re
from dataclasses import dataclass
from .config import CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS


@dataclass
class Chunk:
    chunk_id: str       # "{document_id}_{page}_{index}"
    document_id: str
    filename: str
    page_number: int    # 0 = document-level (TXT/DOCX), 1+ = page-based (PDF)
    chunk_index: int    # position within the page/document
    text: str


def _split_into_chunks(text: str, size: int = CHUNK_SIZE_CHARS, overlap: int = CHUNK_OVERLAP_CHARS) -> list[str]:
    """
    Split text into overlapping character windows.
    Tries to break at sentence/paragraph boundaries when possible.
    """
    text = text.strip()
    if not text:
        return []

    if len(text) <= size:
        return [text]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = start + size

        if end >= len(text):
            chunks.append(text[start:])
            break

        # Try to find a good break point (paragraph > sentence > word)
        break_at = end
        for boundary in ["\n\n", ". ", "? ", "! ", "\n", " "]:
            idx = text.rfind(boundary, start + size // 2, end)
            if idx != -1:
                break_at = idx + len(boundary)
                break

        chunks.append(text[start:break_at].strip())
        start = break_at - overlap  # overlap
        if start < 0:
            start = 0

    return [c for c in chunks if c.strip()]


def chunk_page_text(
    text: str,
    document_id: str,
    filename: str,
    page_number: int,
) -> list[Chunk]:
    """Chunk a single page's extracted text."""
    raw_chunks = _split_into_chunks(text)
    return [
        Chunk(
            chunk_id=f"{document_id}_p{page_number}_c{i}",
            document_id=document_id,
            filename=filename,
            page_number=page_number,
            chunk_index=i,
            text=chunk,
        )
        for i, chunk in enumerate(raw_chunks)
    ]


def chunk_document_text(
    text: str,
    document_id: str,
    filename: str,
) -> list[Chunk]:
    """
    Chunk a flat text (TXT, DOCX without page info).
    Page number is set to 0 (document-level).
    """
    raw_chunks = _split_into_chunks(text)
    return [
        Chunk(
            chunk_id=f"{document_id}_d0_c{i}",
            document_id=document_id,
            filename=filename,
            page_number=0,
            chunk_index=i,
            text=chunk,
        )
        for i, chunk in enumerate(raw_chunks)
    ]
