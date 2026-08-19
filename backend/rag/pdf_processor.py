"""
PDF processing — extracts text and page images using pdfplumber.
Falls back to pypdf if pdfplumber fails on a page.
"""
import base64
import io
import logging
from dataclasses import dataclass
from typing import Optional

import pdfplumber

logger = logging.getLogger(__name__)


@dataclass
class PageContent:
    page_number: int   # 1-indexed
    text: str
    image_b64: Optional[str]  # PNG base64, None if rendering failed/skipped


def extract_pdf_pages(path: str, render_images: bool = True, dpi: int = 120) -> list[PageContent]:
    """
    Extract text (and optionally page images) from every PDF page.
    render_images=True: render each page to PNG for visual embedding.
    dpi=120: balances image quality vs size (higher = bigger base64 blob).
    """
    pages: list[PageContent] = []

    try:
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages, start=1):
                # ── Text extraction ──────────────────────────────────────────
                text = ""
                try:
                    raw = page.extract_text(x_tolerance=2, y_tolerance=2)
                    if raw:
                        text = raw.strip()
                except Exception as e:
                    logger.warning("pdfplumber text extract failed on page %d: %s", i, e)

                # ── Table text ───────────────────────────────────────────────
                try:
                    tables = page.extract_tables()
                    for table in tables:
                        rows = []
                        for row in table:
                            if row:
                                rows.append(" | ".join(str(cell or "") for cell in row))
                        if rows:
                            text += "\n\nTable:\n" + "\n".join(rows)
                except Exception:
                    pass  # tables are a bonus

                # ── Page image rendering ─────────────────────────────────────
                image_b64: Optional[str] = None
                if render_images:
                    try:
                        # pdfplumber uses PIL under the hood for to_image()
                        pil_img = page.to_image(resolution=dpi).original
                        buf = io.BytesIO()
                        pil_img.save(buf, format="PNG")
                        image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    except Exception as e:
                        logger.warning("Page image render failed on page %d: %s", i, e)

                pages.append(PageContent(
                    page_number=i,
                    text=text,
                    image_b64=image_b64,
                ))

    except Exception as e:
        logger.error("Failed to open PDF %s: %s", path, e)
        raise RuntimeError(f"Could not open PDF: {e}") from e

    return pages


def extract_pdf_text_only(path: str) -> list[PageContent]:
    """Fast extraction without image rendering — for Phase 1."""
    return extract_pdf_pages(path, render_images=False)
