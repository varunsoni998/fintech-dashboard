"""
Supplier data management routes — manual entry + CRUD.
Mounted at /api/suppliers/...
Allows employees to manually add/edit/delete hotels, activities, transfers.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


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

class HotelInput(BaseModel):
    supplier_name: str
    hotel_name: str
    destination: str
    star_rating: Optional[int] = None
    room_type: Optional[str] = None
    meal_plan: Optional[str] = None
    price_per_night: float
    currency: str = "INR"
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    cancellation_policy: Optional[str] = None
    inclusions: Optional[list[str]] = None
    source_email: Optional[str] = None
    source_date: Optional[str] = None


class ActivityInput(BaseModel):
    supplier_name: str
    activity_name: str
    destination: str
    description: Optional[str] = None
    duration_hours: Optional[float] = None
    price: float
    currency: str = "INR"
    price_basis: str = "per_person"
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    inclusions: Optional[list[str]] = None
    source_email: Optional[str] = None
    source_date: Optional[str] = None


class TransferInput(BaseModel):
    supplier_name: str
    transfer_type: str
    destination: str
    route: Optional[str] = None
    vehicle_type: Optional[str] = None
    price: float
    currency: str = "INR"
    price_basis: str = "per_vehicle"
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    source_email: Optional[str] = None
    source_date: Optional[str] = None


# ── Hotels ────────────────────────────────────────────────────────────────────

@router.get("/hotels")
def list_hotels(
    destination: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    _get_user_id(authorization)
    try:
        q = supabase.table("supplier_hotels").select("*")
        if destination:
            q = q.ilike("destination", f"%{destination}%")
        result = q.order("created_at", desc=True).execute()
        return {"success": True, "hotels": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hotels")
def create_hotel(payload: HotelInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_hotels").insert(payload.dict()).execute()
        return {"success": True, "hotel": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/hotels/{hotel_id}")
def update_hotel(hotel_id: str, payload: HotelInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_hotels").update(payload.dict()).eq("id", hotel_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Hotel not found")
        return {"success": True, "hotel": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/hotels/{hotel_id}")
def delete_hotel(hotel_id: str, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        supabase.table("supplier_hotels").delete().eq("id", hotel_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Activities ────────────────────────────────────────────────────────────────

@router.get("/activities")
def list_activities(
    destination: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    _get_user_id(authorization)
    try:
        q = supabase.table("supplier_activities").select("*")
        if destination:
            q = q.ilike("destination", f"%{destination}%")
        result = q.order("created_at", desc=True).execute()
        return {"success": True, "activities": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activities")
def create_activity(payload: ActivityInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_activities").insert(payload.dict()).execute()
        return {"success": True, "activity": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/activities/{activity_id}")
def update_activity(activity_id: str, payload: ActivityInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_activities").update(payload.dict()).eq("id", activity_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Activity not found")
        return {"success": True, "activity": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/activities/{activity_id}")
def delete_activity(activity_id: str, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        supabase.table("supplier_activities").delete().eq("id", activity_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Transfers ─────────────────────────────────────────────────────────────────

@router.get("/transfers")
def list_transfers(
    destination: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    _get_user_id(authorization)
    try:
        q = supabase.table("supplier_transfers").select("*")
        if destination:
            q = q.ilike("destination", f"%{destination}%")
        result = q.order("created_at", desc=True).execute()
        return {"success": True, "transfers": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transfers")
def create_transfer(payload: TransferInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_transfers").insert(payload.dict()).execute()
        return {"success": True, "transfer": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/transfers/{transfer_id}")
def update_transfer(transfer_id: str, payload: TransferInput, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        result = supabase.table("supplier_transfers").update(payload.dict()).eq("id", transfer_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Transfer not found")
        return {"success": True, "transfer": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/transfers/{transfer_id}")
def delete_transfer(transfer_id: str, authorization: Optional[str] = Header(None)):
    _get_user_id(authorization)
    try:
        supabase.table("supplier_transfers").delete().eq("id", transfer_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
