"""
Price Compare routes — /api/prices/...

  GET  /status    → is SerpApi configured?
  GET  /roe       → today's exchange rate (₹ per 1 unit of a currency), fetched automatically
  POST /search    → prices for ONE hotel from every booking site Google Hotels knows (via SerpApi)
  POST /discover  → top hotels in a city (e.g. 5★ Ubud) with their lowest price
  POST /excel     → CustomHolidays costing sheet (team's standard layout) as .xlsx

Needs env var SERPAPI_KEYS (comma-separated; SERPAPI_KEY also works). Keys are used in order and the
next key is used when one runs out of monthly searches.
Results are cached in memory for 1 hour so repeating a search doesn't use extra credits.
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
CACHE_SECONDS = 3600          # 1 hour; "Refresh" skips it and asks Google for live prices
_cache: dict = {}


# ── API key pool ───────────────────────────────────────────────────────────────
# SERPAPI_KEYS = "key1,key2,key3" (or a single SERPAPI_KEY). Keys are used in order:
# when one has no searches left this month we move to the next one. SerpApi resets each
# key's allowance monthly, so the pool starts again from key 1 automatically.
ACCOUNT_URL = "https://serpapi.com/account.json"
_left: dict = {}          # key -> (checked_at, searches_left)
LEFT_TTL = 15 * 60


def _keys() -> list:
    raw = os.getenv("SERPAPI_KEYS", "") + "," + os.getenv("SERPAPI_KEY", "")
    out = []
    for k in raw.replace("\n", ",").replace(";", ",").split(","):
        k = k.strip()
        if k and k not in out: out.append(k)
    return out


def _searches_left(key: str, fresh: bool = False) -> int:
    """Searches left on a key this month (SerpApi account API — free, doesn't use a search)."""
    hit = _left.get(key)
    if hit and not fresh and time.time() - hit[0] < LEFT_TTL:
        return hit[1]
    try:
        d = requests.get(ACCOUNT_URL, params={"api_key": key}, timeout=15).json()
        left = int(d.get("total_searches_left", d.get("plan_searches_left", 0)) or 0)
    except Exception:
        left = hit[1] if hit else 1          # unknown → try it
    _left[key] = (time.time(), left)
    return left


def _key() -> str:
    for k in _keys():
        if _searches_left(k) > 0: return k
    return ""


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


def _serp(params: dict, fresh: bool = False) -> dict:
    """One SerpApi call (cached). Moves to the next key when a key runs out. fresh=True → live prices."""
    if not _keys():
        raise HTTPException(status_code=503, detail="Price search isn't set up yet: add SERPAPI_KEYS on the server.")
    ck = tuple(sorted(params.items()))
    hit = _cache.get(ck)
    if hit and not fresh and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    extra = {"no_cache": "true"} if fresh else {}
    last_err = "All SerpApi keys have used their searches for this month."
    for key in _keys():
        if _searches_left(key) <= 0: continue
        try:
            r = requests.get(SERPAPI_URL, params={**params, **extra, "engine": "google_hotels", "api_key": key}, timeout=40)
            data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Price search failed: {e}")
        err = data.get("error")
        if err and ("run out" in err.lower() or "searches" in err.lower() and "limit" in err.lower() or "invalid api key" in err.lower()):
            _left[key] = (time.time(), 0)          # skip this key, try the next one
            last_err = err
            continue
        if err and "hasn't returned any results" in err.lower():
            data = {"properties": []}
        elif err:
            raise HTTPException(status_code=502, detail=err)
        n, left = _left.get(key, (time.time(), 1))
        _left[key] = (n, max(0, left - 1))
        _cache[ck] = (time.time(), data)
        return data
    raise HTTPException(status_code=429, detail=last_err)


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


# Only these websites are shown (plus the hotel's own website). Edit this list to add/remove sites.
ALLOWED_SITES = {"bookingcom": "Booking.com", "agoda": "Agoda", "expedia": "Expedia",
                 "hotelscom": "Hotels.com", "makemytrip": "MakeMyTrip"}


def _site(item: dict, hotel_name: str = "") -> Optional[str]:
    """Allowed site name for a price row, or None to hide it."""
    src = (item.get("source") or "").strip()
    key = "".join(ch for ch in src.lower() if ch.isalnum())
    for k, name in ALLOWED_SITES.items():
        if key.startswith(k):
            return name
    if item.get("official") or "official" in src.lower() or (hotel_name and _similar(src, hotel_name) >= 0.6):
        return "Hotel website"
    return None


def extract_prices(prop: dict, nights: int) -> List[dict]:
    """All booking-site prices for one property → [{source, total, per_night, free_cancellation, link}] cheapest first."""
    best = {}
    for item in (prop.get("featured_prices") or []) + (prop.get("prices") or []):
        src = _site(item, prop.get("name") or "")
        if not src: continue
        total = _num(item.get("total_rate"))
        per = _num(item.get("rate_per_night"))
        if total is None and per is not None: total = per * nights
        if per is None and total is not None: per = total / nights
        if total is None: continue
        tr = item.get("total_rate") if isinstance(item.get("total_rate"), dict) else {}
        before = tr.get("extracted_before_taxes_fees")
        row = {"source": src, "total": round(total), "per_night": round(per), "link": item.get("link"),
               "before_tax": round(before) if isinstance(before, (int, float)) and before < total else None,
               "free_cancellation": bool(item.get("free_cancellation")) or any(
                   bool(rm.get("free_cancellation")) for rm in (item.get("rooms") or []))}
        if src not in best or row["total"] < best[src]["total"]: best[src] = row
    return sorted(best.values(), key=lambda x: x["total"])


def _similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


class Room(BaseModel):
    adults: int = 2
    children_ages: List[int] = []


class SearchIn(BaseModel):
    hotel: str
    city: str = ""
    check_in: str
    check_out: str
    adults: int = 2
    children: int = 0
    currency: str = "INR"
    property_token: Optional[str] = None
    rooms: Optional[List[Room]] = None        # several rooms → priced per room and added up
    fresh: bool = False                       # True → skip caches, live prices from Google


def _occupancy(adults: int, ages: List[int]) -> dict:
    """SerpApi guests for ONE room (Google Hotels prices one room at a time)."""
    ages = [max(1, min(17, int(a or 1))) for a in (ages or [])]
    out = {"adults": max(1, int(adults or 1)), "children": len(ages)}
    if ages: out["children_ages"] = ",".join(str(a) for a in ages)
    return out


def _room_groups(body) -> list:
    """Identical rooms are searched once: [(occupancy_params, how_many_rooms)]."""
    rooms = body.rooms or [Room(adults=body.adults, children_ages=[])]
    groups: dict = {}
    for r in rooms:
        occ = _occupancy(r.adults, r.children_ages)
        k = tuple(sorted(occ.items()))
        groups[k] = (occ, groups.get(k, (occ, 0))[1] + 1)
    return list(groups.values())


# ── ROE (exchange rate) ────────────────────────────────────────────────────────
# Free, keyless sources tried in order: European Central Bank reference rates (via Frankfurter),
# then open.er-api.com (covers AED etc. that the ECB doesn't publish). Cached 1 hour.
_roe_cache: dict = {}
ROE_TTL = 3600


def _fetch_roe(ccy: str) -> dict:
    ccy = ccy.upper()
    if ccy == "INR":
        return {"ccy": "INR", "roe": 1.0, "source": "—", "date": date.today().isoformat()}
    hit = _roe_cache.get(ccy)
    if hit and time.time() - hit[0] < ROE_TTL:
        return hit[1]
    tries = [
        ("ECB (European Central Bank)", f"https://api.frankfurter.dev/v1/latest?from={ccy}&to=INR",
         lambda d: (d["rates"]["INR"], d.get("date"))),
        ("ECB (European Central Bank)", f"https://api.frankfurter.app/latest?from={ccy}&to=INR",
         lambda d: (d["rates"]["INR"], d.get("date"))),
        ("ExchangeRate-API", f"https://open.er-api.com/v6/latest/{ccy}",
         lambda d: (d["rates"]["INR"], (d.get("time_last_update_utc") or "")[5:16])),
    ]
    for name, url, pick in tries:
        try:
            r = requests.get(url, timeout=12)
            r.raise_for_status()
            rate, day = pick(r.json())
            out = {"ccy": ccy, "roe": round(float(rate), 4), "source": name, "date": day or date.today().isoformat()}
            _roe_cache[ccy] = (time.time(), out)
            return out
        except Exception as e:
            logger.warning("ROE source %s failed for %s: %s", name, ccy, e)
    if hit:                                     # every source down → last known rate
        return {**hit[1], "stale": True}
    raise HTTPException(status_code=502, detail=f"Couldn't fetch today's {ccy} rate. Try again in a minute.")


@router.get("/roe")
def roe(ccy: str = "USD", authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    return _fetch_roe(ccy)


@router.get("/status")
def status(authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    keys = _keys()
    lefts = [_searches_left(k, fresh=True) for k in keys]
    active = next((i + 1 for i, l in enumerate(lefts) if l > 0), None)
    return {"configured": bool(keys), "keys": len(keys), "searches_left": sum(lefts), "active_key": active}


def _search_one(body: SearchIn, occ: dict, nights: int, token: Optional[str]) -> dict:
    """Prices for ONE room with the given guests."""
    base = {"check_in_date": body.check_in, "check_out_date": body.check_out, **occ,
            "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    if token:                      # hotel picked from "Find hotels" → 1 search instead of 2
        data = _serp({**base, "q": body.hotel, "property_token": token}, body.fresh)
    else:
        data = _serp({**base, "q": f"{body.hotel} {body.city}".strip()}, body.fresh)
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
            prop = {**prop, **_serp({**base, "q": body.hotel, "property_token": prop["property_token"]}, body.fresh)}
            searches += 1
    prices = extract_prices(prop, nights)
    imgs = prop.get("images") or []
    return {"found": True, "hotel": body.hotel, "name": prop.get("name") or body.hotel,
            "stars": prop.get("extracted_hotel_class"), "rating": prop.get("overall_rating"),
            "reviews": prop.get("reviews"), "image": (imgs[0].get("thumbnail") if imgs else None),
            "link": prop.get("link"), "property_token": prop.get("property_token"),
            "nights": nights, "currency": body.currency.upper(), "prices": prices,
            "lowest": prices[0] if prices else None, "searches_used": searches}


@router.post("/search")
def search(body: SearchIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    groups = _room_groups(body)
    first = _search_one(body, groups[0][0], nights, body.property_token)
    n_rooms = sum(n for _, n in groups)
    if not first.get("found") or (len(groups) == 1 and groups[0][1] == 1):
        return {**first, "rooms": n_rooms}
    token = first.get("property_token") or body.property_token
    parts = [(first["prices"], groups[0][1])]
    used = first["searches_used"]
    for occ, n in groups[1:]:
        r = _search_one(body, occ, nights, token)
        used += r.get("searches_used", 1)
        parts.append((r.get("prices") or [], n))
    # a site counts only if it has a price for every room type; total = sum of all rooms
    combined = []
    for p in parts[0][0]:
        rows = [next((x for x in prices if x["source"] == p["source"]), None) for prices, _ in parts]
        if any(x is None for x in rows): continue
        total = sum(x["total"] * n for x, (_, n) in zip(rows, parts))
        bt = [x.get("before_tax") or x["total"] for x in rows]
        before = sum(b * n for b, (_, n) in zip(bt, parts))
        combined.append({"source": p["source"], "total": round(total), "per_night": round(total / nights),
                         "before_tax": round(before) if before < total else None,
                         "link": p.get("link"), "free_cancellation": all(x["free_cancellation"] for x in rows)})
    combined.sort(key=lambda x: x["total"])
    return {**first, "prices": combined, "lowest": combined[0] if combined else None,
            "searches_used": used, "rooms": n_rooms}


class DiscoverIn(BaseModel):
    city: str
    check_in: str
    check_out: str
    adults: int = 2
    stars: Optional[int] = 5
    currency: str = "INR"
    limit: int = 25
    rooms: Optional[List[Room]] = None


@router.post("/discover")
def discover(body: DiscoverIn, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    nights = _nights(body.check_in, body.check_out)
    rooms = body.rooms or [Room(adults=body.adults)]
    occ = _occupancy(rooms[0].adults, rooms[0].children_ages)
    params = {"q": f"hotels in {body.city}", "check_in_date": body.check_in, "check_out_date": body.check_out,
              **occ, "currency": body.currency.upper(), "gl": "in", "hl": "en"}
    if body.stars: params["hotel_class"] = str(body.stars)
    data = _serp(params)
    out = []
    for p in (data.get("properties") or []):
        if (p.get("type") or "hotel").lower() != "hotel": continue
        total = _num(p.get("total_rate")) or ((_num(p.get("rate_per_night")) or 0) * nights) or None
        if not total: continue                 # Google has no price for these dates → don't show it
        imgs = p.get("images") or []
        out.append({"name": p.get("name"), "stars": p.get("extracted_hotel_class"), "rating": p.get("overall_rating"),
                    "reviews": p.get("reviews"), "lowest_total": round(total * len(rooms)) if total else None,
                    "image": imgs[0].get("thumbnail") if imgs else None, "property_token": p.get("property_token")})
        if len(out) >= body.limit: break
    out.sort(key=lambda h: h["lowest_total"] or 9e12)
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
