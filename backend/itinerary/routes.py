"""
Itinerary Management System — FastAPI routes.
Mounted at /api/itinerary/...

Endpoints:
  GET    /api/itinerary/suppliers/search     — search hotels/activities/transfers
  POST   /api/itinerary/generate             — AI itinerary generation (streaming SSE)
  POST   /api/itinerary/save                 — save/update itinerary
  GET    /api/itinerary/list                 — list user's itineraries
  GET    /api/itinerary/{id}                 — get single itinerary
  DELETE /api/itinerary/{id}                 — delete itinerary
  POST   /api/itinerary/clients              — create/update client
  GET    /api/itinerary/clients              — list clients
"""
import json
import logging
import os
import re
import uuid
from typing import Optional

import requests
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GENERATION_MODEL = os.getenv("ITINERARY_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")


# ── Auth helper ───────────────────────────────────────────────────────────────

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


# ── Models ────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class SupplierSearchRequest(BaseModel):
    destination: str
    hotel_category: Optional[str] = None
    meal_plan: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    activities: Optional[list[str]] = None
    budget: Optional[float] = None
    currency: Optional[str] = "INR"
    trip_type: Optional[str] = None


class GenerateItineraryRequest(BaseModel):
    client_name: str
    adults: int = 2
    children: int = 0
    special_requirements: Optional[str] = None
    destination: str
    departure_city: Optional[str] = None
    start_date: str
    end_date: str
    nights: int
    budget: Optional[float] = None
    currency: str = "INR"
    hotel_category: Optional[str] = None
    meal_plan: Optional[str] = None
    trip_type: Optional[str] = None
    special_requests: Optional[str] = None
    selected_hotels: list[dict] = []
    selected_activities: list[dict] = []
    selected_transfers: list[dict] = []


class SaveItineraryRequest(BaseModel):
    id: Optional[str] = None
    client_id: Optional[str] = None
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    adults: int = 2
    children: int = 0
    special_requirements: Optional[str] = None
    destination: str
    departure_city: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    nights: Optional[int] = None
    budget: Optional[float] = None
    currency: str = "INR"
    hotel_category: Optional[str] = None
    meal_plan: Optional[str] = None
    transport_preference: Optional[str] = None
    room_preference: Optional[str] = None
    trip_type: Optional[str] = None
    activities: Optional[list[str]] = None
    special_requests: Optional[str] = None
    itinerary_content: Optional[list[dict]] = None
    itinerary_notes: Optional[str] = None
    status: str = "draft"
    selected_hotels: list[dict] = []
    selected_activities: list[dict] = []
    selected_transfers: list[dict] = []
    hotel_cost: float = 0
    activity_cost: float = 0
    transfer_cost: float = 0
    other_cost: float = 0
    markup_type: str = "percentage"
    markup_value: float = 0
    discount_amount: float = 0
    tax_amount: float = 0


# ── Client endpoints ──────────────────────────────────────────────────────────

@router.post("/clients")
def create_client(payload: ClientCreate, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = supabase.table("itinerary_clients").insert({
            "user_id": user_id, "name": payload.name, "email": payload.email,
            "phone": payload.phone, "notes": payload.notes,
        }).execute()
        return {"success": True, "client": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clients")
def list_clients(authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("itinerary_clients").select("*")
            .eq("user_id", user_id).order("name").execute()
        )
        return {"success": True, "clients": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Supplier search — NOW COMBINES KNOWLEDGE BASE + GENERAL SUPPLIERS ──────────

@router.post("/suppliers/search")
def search_suppliers(
    payload: SupplierSearchRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Combined supplier search across TWO sources:

    1. Knowledge Base tables (supplier_hotels, supplier_activities, supplier_transfers)
       — populated by Gmail sync + manual entry on the Knowledge Base page.
       This is the PRIMARY source used to build the itinerary — it has
       structured pricing, dates, meal plans etc.

    2. General `suppliers` table (onboarded via Notion/onboarding flow)
       — used to cross-reference and verify which suppliers in the
       Knowledge Base are actually active/onboarded partners, and to
       surface onboarded suppliers in this destination that DON'T yet
       have Knowledge Base rate entries (so the user knows to follow up
       and get rates from them).
    """
    _get_user_id(authorization)

    dest = payload.destination.strip()
    dest_lower = dest.lower()

    # ── 1. Knowledge Base: Hotels ──────────────────────────────────────────
    hotel_query = supabase.table("supplier_hotels").select("*").ilike("destination", f"%{dest_lower}%")

    if payload.hotel_category:
        try:
            stars = int(payload.hotel_category.split()[0])
            hotel_query = hotel_query.eq("star_rating", stars)
        except (ValueError, IndexError):
            pass

    if payload.meal_plan:
        meal_map = {
            "Breakfast": "BB", "Half Board": "MAP", "Full Board": "AP",
            "Room Only": "EP", "All Inclusive": "AI",
        }
        meal_code = meal_map.get(payload.meal_plan, payload.meal_plan)
        hotel_query = hotel_query.eq("meal_plan", meal_code)

    hotels = (hotel_query.order("star_rating", desc=True).execute().data) or []

    if payload.start_date:
        hotels = [h for h in hotels if not h.get("valid_to") or h["valid_to"] >= payload.start_date]
    if payload.end_date:
        hotels = [h for h in hotels if not h.get("valid_from") or h["valid_from"] <= payload.end_date]

    # ── 2. Knowledge Base: Activities ──────────────────────────────────────
    activities = (
        supabase.table("supplier_activities").select("*")
        .ilike("destination", f"%{dest_lower}%").order("price").execute().data
    ) or []

    if payload.activities:
        requested = [a.lower() for a in payload.activities]
        def activity_score(act):
            name = act["activity_name"].lower()
            desc = (act.get("description") or "").lower()
            return any(req in name or req in desc for req in requested)
        activities.sort(key=lambda a: (0 if activity_score(a) else 1, a.get("price", 0)))

    # ── 3. Knowledge Base: Transfers ────────────────────────────────────────
    transfers = (
        supabase.table("supplier_transfers").select("*")
        .ilike("destination", f"%{dest_lower}%").order("transfer_type").execute().data
    ) or []

    # ── 4. General suppliers table (onboarding data) — cross-reference ─────
    # Match on `place` field since that's the destination column in that table
    onboarded_suppliers = (
        supabase.table("suppliers")
        .select("id, name, company_name, supplier_type, place, phone, email, onboarding_status")
        .ilike("place", f"%{dest_lower}%")
        .execute().data
    ) or []

    # Build a set of supplier names that ALREADY have knowledge-base rates
    kb_supplier_names = set()
    for h in hotels:
        if h.get("supplier_name"):
            kb_supplier_names.add(h["supplier_name"].strip().lower())
    for a in activities:
        if a.get("supplier_name"):
            kb_supplier_names.add(a["supplier_name"].strip().lower())
    for t in transfers:
        if t.get("supplier_name"):
            kb_supplier_names.add(t["supplier_name"].strip().lower())

    # Onboarded suppliers WITHOUT knowledge base rates yet — flagged for follow-up
    suppliers_missing_rates = [
        s for s in onboarded_suppliers
        if (s.get("company_name") or s.get("name") or "").strip().lower() not in kb_supplier_names
    ]

    # Onboarded suppliers that DO have rates — verified/trusted badge candidates
    verified_supplier_names = {
        (s.get("company_name") or s.get("name") or "").strip().lower()
        for s in onboarded_suppliers
    }
    for h in hotels:
        h["is_onboarded_supplier"] = (h.get("supplier_name") or "").strip().lower() in verified_supplier_names
    for a in activities:
        a["is_onboarded_supplier"] = (a.get("supplier_name") or "").strip().lower() in verified_supplier_names
    for t in transfers:
        t["is_onboarded_supplier"] = (t.get("supplier_name") or "").strip().lower() in verified_supplier_names

    return {
        "success": True,
        "destination": dest,
        "hotels": hotels,
        "activities": activities,
        "transfers": transfers,
        "suppliers_missing_rates": suppliers_missing_rates,
        "total": len(hotels) + len(activities) + len(transfers),
        "has_data": (len(hotels) + len(activities) + len(transfers)) > 0,
    }


# ── AI Itinerary Generation ───────────────────────────────────────────────────

ITINERARY_SYSTEM_PROMPT = """You are an expert travel itinerary planner for a luxury travel agency.

Your job is to create a detailed, professional day-by-day itinerary using ONLY the information provided.

STRICT RULES — NEVER VIOLATE:
1. Only use the hotels, activities, and transfers explicitly provided in the input.
2. Never invent prices — all pricing comes from the structured data provided.
3. Never invent hotel names, activity names, or supplier details.
4. Never invent availability, inclusions, or cancellation policies.
5. If information is missing, state "Information not available in supplier data."
6. Do NOT add hotels, restaurants, or activities that were not selected.
7. Assign activities and transfers to logical days based on dates and sequence.

OUTPUT FORMAT — respond with ONLY a valid JSON object, no other text before or after:
{
  "days": [
    {
      "day_number": 1,
      "date": "2026-10-15",
      "title": "DAY 1 — ARRIVAL IN DUBAI",
      "items": [
        {
          "time": "14:00",
          "type": "transfer",
          "title": "Airport Transfer",
          "description": "Private transfer from Dubai International Airport to hotel",
          "supplier": "Gulf Holidays DMC",
          "notes": ""
        }
      ]
    }
  ],
  "summary": "Short 1-2 sentence trip summary.",
  "inclusions": ["item1", "item2"],
  "exclusions": ["item1", "item2"],
  "important_notes": ["note1", "note2"]
}

Return ONLY the raw JSON object. Do not wrap in markdown code fences. Do not add commentary.
"""


def _build_supplier_text(payload: GenerateItineraryRequest) -> tuple[str, str, str]:
    hotels_text = ""
    for h in payload.selected_hotels:
        hotels_text += (
            f"- {h.get('hotel_name')} ({h.get('star_rating', '')}★), "
            f"{h.get('room_type', '')}, {h.get('meal_plan', '')}, "
            f"{payload.currency} {h.get('price_per_night', 0):,.0f}/night, "
            f"Supplier: {h.get('supplier_name', '')}, "
            f"Cancellation: {h.get('cancellation_policy', 'N/A')}\n"
        )

    activities_text = ""
    for a in payload.selected_activities:
        activities_text += (
            f"- {a.get('activity_name')}: {a.get('description', '')}, "
            f"{a.get('duration_hours', '')} hrs, "
            f"{payload.currency} {a.get('price', 0):,.0f}/{a.get('price_basis', 'person')}, "
            f"Supplier: {a.get('supplier_name', '')}\n"
        )

    transfers_text = ""
    for t in payload.selected_transfers:
        transfers_text += (
            f"- {t.get('transfer_type')}: {t.get('route', '')}, "
            f"{t.get('vehicle_type', '')}, "
            f"{payload.currency} {t.get('price', 0):,.0f}/{t.get('price_basis', 'vehicle')}, "
            f"Supplier: {t.get('supplier_name', '')}\n"
        )

    return (
        hotels_text or "No hotels selected.",
        activities_text or "No activities selected.",
        transfers_text or "No transfers selected.",
    )


@router.post("/generate")
async def generate_itinerary(
    payload: GenerateItineraryRequest,
    authorization: Optional[str] = Header(None),
):
    """Streaming SSE itinerary generation using knowledge-base supplier data."""
    _get_user_id(authorization)

    if not OPENROUTER_API_KEY:
        def _err_stream():
            yield f"data: {json.dumps({'error': 'OPENROUTER_API_KEY is not set on the backend. Add it to your Render environment variables.'})}\n\n"
        return StreamingResponse(_err_stream(), media_type="text/event-stream")

    if not payload.selected_hotels and not payload.selected_activities and not payload.selected_transfers:
        def _empty_stream():
            yield f"data: {json.dumps({'error': 'No supplier items selected. Go back and select at least one hotel or activity from the Knowledge Base.'})}\n\n"
        return StreamingResponse(_empty_stream(), media_type="text/event-stream")

    hotels_text, activities_text, transfers_text = _build_supplier_text(payload)

    budget_str = f"{payload.currency} {payload.budget:,.0f}" if payload.budget else "Not specified"

    user_prompt = f"""Create a complete day-by-day itinerary with the following details:

CLIENT: {payload.client_name}
TRAVELERS: {payload.adults} adult(s){f', {payload.children} child(ren)' if payload.children else ''}
DESTINATION: {payload.destination}
{f'DEPARTURE CITY: {payload.departure_city}' if payload.departure_city else ''}
DATES: {payload.start_date} to {payload.end_date} ({payload.nights} nights)
BUDGET: {budget_str}
TRIP TYPE: {payload.trip_type or 'Leisure'}
MEAL PLAN: {payload.meal_plan or 'As per hotel'}
{f'SPECIAL REQUESTS: {payload.special_requests}' if payload.special_requests else ''}
{f'SPECIAL REQUIREMENTS: {payload.special_requirements}' if payload.special_requirements else ''}

SELECTED HOTELS (from Knowledge Base):
{hotels_text}

SELECTED ACTIVITIES (from Knowledge Base):
{activities_text}

SELECTED TRANSFERS (from Knowledge Base):
{transfers_text}

Generate a logical, professional day-by-day itinerary. Distribute activities sensibly across the {payload.nights} nights.
Day 1 should be arrival day. Last day should be departure day.
"""

    messages = [
        {"role": "system", "content": ITINERARY_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    def _stream():
        full_content = ""
        try:
            with requests.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"model": GENERATION_MODEL, "messages": messages, "stream": True},
                stream=True,
                timeout=300,
            ) as resp:
                if resp.status_code != 200:
                    err_body = resp.text[:500]
                    logger.error("OpenRouter returned %s: %s", resp.status_code, err_body)
                    yield f"data: {json.dumps({'error': f'AI provider returned {resp.status_code}: {err_body}'})}\n\n"
                    return

                for line in resp.iter_lines():
                    if not line:
                        continue
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: "):
                        decoded = decoded[6:]
                    if decoded.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(decoded)
                    except Exception:
                        continue
                    if chunk.get("error"):
                        yield f"data: {json.dumps({'error': str(chunk['error'])})}\n\n"
                        return
                    token = chunk.get("choices", [{}])[0].get("delta", {}).get("content") or ""
                    if token:
                        full_content += token
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    if chunk.get("choices", [{}])[0].get("finish_reason"):
                        break

            if not full_content.strip():
                yield f"data: {json.dumps({'error': 'AI provider returned an empty response. Try again or check your OpenRouter credits/model access.'})}\n\n"
                return

            # Parse the completed JSON — strip thinking tags and code fences
            cleaned = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL).strip()
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned).strip()
            cleaned = re.sub(r"\s*```$", "", cleaned).strip()

            try:
                parsed = json.loads(cleaned)
                if not parsed.get("days"):
                    yield f"data: {json.dumps({'done': True, 'raw': cleaned, 'parse_error': True, 'error': 'AI response had no days array'})}\n\n"
                    return
                yield f"data: {json.dumps({'done': True, 'itinerary': parsed})}\n\n"
            except json.JSONDecodeError as je:
                logger.error("Failed to parse itinerary JSON: %s\nContent: %s", je, cleaned[:1000])
                yield f"data: {json.dumps({'done': True, 'raw': cleaned, 'parse_error': True, 'error': f'Could not parse AI response as JSON: {je}'})}\n\n"

        except requests.exceptions.Timeout:
            yield f"data: {json.dumps({'error': 'Request to AI provider timed out after 5 minutes.'})}\n\n"
        except Exception as e:
            logger.error("Itinerary generation failed: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ── Save / Update itinerary ───────────────────────────────────────────────────

def _calculate_pricing(payload: SaveItineraryRequest) -> dict:
    supplier_total = (
        payload.hotel_cost + payload.activity_cost + payload.transfer_cost + payload.other_cost
    )
    if payload.markup_type == "percentage":
        markup_amount = supplier_total * (payload.markup_value / 100)
    else:
        markup_amount = payload.markup_value
    final_price = supplier_total + markup_amount - payload.discount_amount + payload.tax_amount
    return {
        "supplier_total": round(supplier_total, 2),
        "markup_amount": round(markup_amount, 2),
        "final_price": round(max(0, final_price), 2),
    }


@router.post("/save")
def save_itinerary(payload: SaveItineraryRequest, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    pricing = _calculate_pricing(payload)

    row = {
        "user_id": user_id, "client_id": payload.client_id, "client_name": payload.client_name,
        "client_email": payload.client_email, "client_phone": payload.client_phone,
        "adults": payload.adults, "children": payload.children,
        "special_requirements": payload.special_requirements, "destination": payload.destination,
        "departure_city": payload.departure_city, "start_date": payload.start_date,
        "end_date": payload.end_date, "nights": payload.nights, "budget": payload.budget,
        "currency": payload.currency, "hotel_category": payload.hotel_category,
        "meal_plan": payload.meal_plan, "transport_preference": payload.transport_preference,
        "room_preference": payload.room_preference, "trip_type": payload.trip_type,
        "activities": payload.activities or [], "special_requests": payload.special_requests,
        "itinerary_content": payload.itinerary_content, "itinerary_notes": payload.itinerary_notes,
        "status": payload.status, "selected_hotels": payload.selected_hotels,
        "selected_activities": payload.selected_activities, "selected_transfers": payload.selected_transfers,
        "hotel_cost": payload.hotel_cost, "activity_cost": payload.activity_cost,
        "transfer_cost": payload.transfer_cost, "other_cost": payload.other_cost,
        "markup_type": payload.markup_type, "markup_value": payload.markup_value,
        "markup_amount": pricing["markup_amount"], "discount_amount": payload.discount_amount,
        "tax_amount": payload.tax_amount, "supplier_total": pricing["supplier_total"],
        "final_price": pricing["final_price"], "updated_at": "now()",
    }

    try:
        if payload.id:
            result = (
                supabase.table("itineraries").update(row)
                .eq("id", payload.id).eq("user_id", user_id).execute()
            )
            if not result.data:
                raise HTTPException(status_code=404, detail="Itinerary not found")
            return {"success": True, "itinerary": result.data[0], "pricing": pricing}
        else:
            result = supabase.table("itineraries").insert(row).execute()
            return {"success": True, "itinerary": result.data[0], "pricing": pricing}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── List / Get / Delete ───────────────────────────────────────────────────────

@router.get("/list")
def list_itineraries(status: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        query = (
            supabase.table("itineraries")
            .select("id, client_name, destination, start_date, end_date, nights, status, final_price, currency, created_at, updated_at")
            .eq("user_id", user_id).order("updated_at", desc=True)
        )
        if status:
            query = query.eq("status", status)
        result = query.execute()
        return {"success": True, "itineraries": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{itinerary_id}")
def get_itinerary(itinerary_id: str, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("itineraries").select("*")
            .eq("id", itinerary_id).eq("user_id", user_id).single().execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        return {"success": True, "itinerary": result.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{itinerary_id}")
def delete_itinerary(itinerary_id: str, authorization: Optional[str] = Header(None)):
    user_id = _get_user_id(authorization)
    try:
        result = (
            supabase.table("itineraries").delete()
            .eq("id", itinerary_id).eq("user_id", user_id).execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Itinerary not found")
        return {"success": True, "deleted_id": itinerary_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))