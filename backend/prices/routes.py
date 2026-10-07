"""
Price Compare routes — /api/prices/...

  GET  /status    → is SerpApi configured?
  POST /search    → prices for ONE hotel from every booking site Google Hotels knows (via SerpApi)
  POST /discover  → top hotels in a city (e.g. 5★ Ubud) with their lowest price
  POST /excel     → CustomHolidays costing sheet (team's standard layout) as .xlsx

Needs env var SERPAPI_KEY (free plan: 250 searches / month at serpapi.com).
Results are cached in memory for 6 hours so repeating a search doesn't use extra credits.
"""
import difflib
import logging
import os
import tempfile
import time
from datetime import date
from typing import Optional, List

import requests
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from supabase_client import supabase
from .costing_sheet import build as build_costing_sheet

logger = logging.getLogger(__name__)
router = APIRouter()

SERPAPI_URL = "https://serpapi.com/search.json"
CACHE_SECONDS = 6 * 3600
_cache: dict = {}


def _key() -> str:
    return os.getenv("SERPAPI_KEY", "").strip()


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


def _serp(params: dict) -> dict:
    """One SerpApi call (cached)."""
    if not _key():
        raise HTTPException(status_code=503, detail="Price search isn't set up yet: add SERPAPI_KEY on the server.")
    ck = tuple(sorted(params.items()))
    hit = _cache.get(ck)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        r = requests.get(SERPAPI_URL, params={**params, "engine": "google_hotels", "api_key": _key()}, timeout=40)
        data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Price search failed: {e}")
    if data.get("error"):
        msg = data["error"]
        if "run out of searches" in msg.lower():
            msg = "SerpApi monthly searches used up. Upgrade the plan or wait for next month."
        raise HTTPException(status_code=502, detail=msg)
    _cache[ck] = (time.time(), data)
    return data


def _num(v) -> Optional[float]:
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, dict):
        for k in ("extracted_lowest", "extracted_before_taxes_fees"):
            if isinstance(v.get(k), (int, float)): return float(v[k])
    return None


def _nights(ci: str, co: str) -> int:
    try:
        return max(1, (date.fromisoformat(co) - date.fromisoformat(ci)).days)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD and check-out after check-in")


def extract_prices(prop: dict, nights: int) -> List[dict]:
    """All booking-site prices for one property → [{source, total, per_night, free_cancellation, link}] cheapest first."""
    best = {}
    for item in (prop.get("featured_prices") or []) + (prop.get("prices") or []):
        src = (item.get("source") or "").strip()
        if not src: continue
        total = _num(item.get("total_rate"))
        per = _num(item.get("rate_per_night"))
        if total is None and per is not None: total = per * nights
        if per is None and total is not None: per = total / nights
        if total is None: continue
        row = {"source": src, "total": round(total), "per_night": round(per), "link": item.get("link"),
               "free_cancellation": bool(item.get("free_cancellation")) or any(
                   bool(rm.get("free_cancellation")) for rm in (item.get("rooms") or []))}
        if src not in best or row["total"] < best[src]["total"]: best[src] = row
    return sorted(best.values(), key=lambda x: x["total"])


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


class SearchIn(BaseModel):
    hotel: str
    city: str = ""
    check_in: str
    check_out: str
    adults: int = 2
    children: int = 0
    currency: str = "INR"


@router.get("/status")
def status(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return {"configured": bool(_key())}


@router.post("/search")
def search(body: SearchIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    base = {"check_in_date": body.check_in, "check_out_date": body.check_out, "adults": body.adults,
            "children": body.children, "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    data = _serp({**base, "q": f"{body.hotel} {body.city}".strip()})
    searches = 1
    prop = data
    if not (data.get("prices") or data.get("featured_prices")):
        props = data.get("properties") or []
        if not props:
            return {"found": False, "hotel": body.hotel, "prices": [], "searches_used": searches}
        prop = max(props, key=lambda p: _similar(p.get("name", ""), body.hotel))
        if _similar(prop.get("name", ""), body.hotel) < 0.45:
            return {"found": False, "hotel": body.hotel, "prices": [], "searches_used": searches,
                    "suggestions": [p.get("name") for p in props[:5]]}
        if prop.get("property_token"):
            prop = {**prop, **_serp({**base, "q": body.hotel, "property_token": prop["property_token"]})}
            searches += 1
    prices = extract_prices(prop, nights)
    return {"found": True, "hotel": body.hotel, "name": prop.get("name") or body.hotel,
            "stars": prop.get("extracted_hotel_class"), "rating": prop.get("overall_rating"),
            "nights": nights, "currency": body.currency.upper(), "prices": prices,
            "lowest": prices[0] if prices else None, "searches_used": searches}


class DiscoverIn(BaseModel):
    city: str
    check_in: str
    check_out: str
    adults: int = 2
    stars: Optional[int] = 5
    currency: str = "INR"
    limit: int = 8


@router.post("/discover")
def discover(body: DiscoverIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    params = {"q": f"hotels in {body.city}", "check_in_date": body.check_in, "check_out_date": body.check_out,
              "adults": body.adults, "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    if body.stars: params["hotel_class"] = str(body.stars)
    data = _serp(params)
    out = []
    for p in (data.get("properties") or []):
        if (p.get("type") or "hotel").lower() != "hotel": continue
        total = _num(p.get("total_rate")) or ((_num(p.get("rate_per_night")) or 0) * nights) or None
        out.append({"name": p.get("name"), "stars": p.get("extracted_hotel_class"), "rating": p.get("overall_rating"),
                    "reviews": p.get("reviews"), "lowest_total": round(total) if total else None})
        if len(out) >= body.limit: break
    return {"city": body.city, "hotels": out, "searches_used": 1}


@router.post("/excel")
def excel(body: dict, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    name = ((body.get("trip") or {}).get("name") or "Trip").replace("/", "-")
    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False); tmp.close()
    os.unlink(tmp.name)                       # builder must create a fresh workbook
    try:
        build_costing_sheet(body, tmp.name)
    except Exception as e:
        logger.exception("costing sheet failed")
        raise HTTPException(status_code=400, detail=f"Could not build the sheet: {e}")
    return FileResponse(tmp.name, filename=f"{name} costing.xlsx",
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        background=BackgroundTask(lambda: os.path.exists(tmp.name) and os.unlink(tmp.name)))
