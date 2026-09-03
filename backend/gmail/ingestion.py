"""
Gmail ingestion pipeline.
Orchestrates: fetch → classify → extract → validate → store.
Can be triggered manually via API or run as a background job.
"""
import logging
from datetime import datetime
from typing import Optional

from supabase_client import supabase

from .auth import get_valid_access_token
from .fetcher import (
    list_messages,
    get_message,
    get_attachment,
    extract_email_body,
    extract_attachments,
    get_message_metadata,
    get_already_processed_ids,
    mark_processed,
    SUPPLIER_QUERY,
)
from .extractor import classify_email, extract_supplier_data, extract_text_from_attachment

logger = logging.getLogger(__name__)

# Categories that contain extractable supplier data
EXTRACTABLE_CATEGORIES = {
    "HOTEL_RATE", "ACTIVITY_RATE", "TRANSFER_RATE",
    "CONTRACT", "GENERAL_SUPPLIER",
}


class IngestionResult:
    def __init__(self):
        self.fetched = 0
        self.skipped_already_processed = 0
        self.skipped_irrelevant = 0
        self.extracted = 0
        self.hotels_added = 0
        self.activities_added = 0
        self.transfers_added = 0
        self.errors = 0
        self.log: list[str] = []

    def to_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "skipped_already_processed": self.skipped_already_processed,
            "skipped_irrelevant": self.skipped_irrelevant,
            "extracted": self.extracted,
            "hotels_added": self.hotels_added,
            "activities_added": self.activities_added,
            "transfers_added": self.transfers_added,
            "errors": self.errors,
            "log": self.log[-50:],  # last 50 log lines
        }


def _insert_hotels(hotels: list[dict], result: IngestionResult) -> None:
    for hotel in hotels:
        # Validate required fields
        if not hotel.get("hotel_name") or not hotel.get("destination"):
            continue
        try:
            price = float(hotel.get("price_per_night", 0))
            if price <= 0:
                continue
            supabase.table("supplier_hotels").insert({
                "supplier_name":      hotel.get("supplier_name", "Unknown"),
                "hotel_name":         hotel["hotel_name"],
                "destination":        hotel["destination"],
                "star_rating":        hotel.get("star_rating"),
                "room_type":          hotel.get("room_type"),
                "meal_plan":          hotel.get("meal_plan"),
                "price_per_night":    price,
                "currency":           hotel.get("currency", "INR"),
                "valid_from":         hotel.get("valid_from"),
                "valid_to":           hotel.get("valid_to"),
                "cancellation_policy": hotel.get("cancellation_policy"),
                "inclusions":         hotel.get("inclusions", []),
                "source_email":       hotel.get("source_email", ""),
                "source_date":        hotel.get("source_date"),
            }).execute()
            result.hotels_added += 1
            result.log.append(f"  ✓ Hotel: {hotel['hotel_name']} — {hotel.get('currency', 'INR')} {price}/night")
        except Exception as e:
            logger.error("Failed to insert hotel %s: %s", hotel.get("hotel_name"), e)
            result.errors += 1


def _insert_activities(activities: list[dict], result: IngestionResult) -> None:
    for act in activities:
        if not act.get("activity_name") or not act.get("destination"):
            continue
        try:
            price = float(act.get("price", 0))
            if price <= 0:
                continue
            supabase.table("supplier_activities").insert({
                "supplier_name":  act.get("supplier_name", "Unknown"),
                "activity_name":  act["activity_name"],
                "destination":    act["destination"],
                "description":    act.get("description"),
                "duration_hours": act.get("duration_hours"),
                "price":          price,
                "currency":       act.get("currency", "INR"),
                "price_basis":    act.get("price_basis", "per_person"),
                "valid_from":     act.get("valid_from"),
                "valid_to":       act.get("valid_to"),
                "inclusions":     act.get("inclusions", []),
                "source_email":   act.get("source_email", ""),
                "source_date":    act.get("source_date"),
            }).execute()
            result.activities_added += 1
            result.log.append(f"  ✓ Activity: {act['activity_name']} — {act.get('currency', 'INR')} {price}/{act.get('price_basis', 'person')}")
        except Exception as e:
            logger.error("Failed to insert activity %s: %s", act.get("activity_name"), e)
            result.errors += 1


def _insert_transfers(transfers: list[dict], result: IngestionResult) -> None:
    for tr in transfers:
        if not tr.get("transfer_type") or not tr.get("destination"):
            continue
        try:
            price = float(tr.get("price", 0))
            if price <= 0:
                continue
            supabase.table("supplier_transfers").insert({
                "supplier_name":  tr.get("supplier_name", "Unknown"),
                "transfer_type":  tr["transfer_type"],
                "destination":    tr["destination"],
                "route":          tr.get("route"),
                "vehicle_type":   tr.get("vehicle_type"),
                "price":          price,
                "currency":       tr.get("currency", "INR"),
                "price_basis":    tr.get("price_basis", "per_vehicle"),
                "valid_from":     tr.get("valid_from"),
                "valid_to":       tr.get("valid_to"),
                "source_email":   tr.get("source_email", ""),
                "source_date":    tr.get("source_date"),
            }).execute()
            result.transfers_added += 1
            result.log.append(f"  ✓ Transfer: {tr['transfer_type']} {tr['destination']} — {tr.get('currency', 'INR')} {price}")
        except Exception as e:
            logger.error("Failed to insert transfer: %s", e)
            result.errors += 1


def run_ingestion(
    user_id: str,
    max_emails: int = 20,
    status_callback=None,
) -> IngestionResult:
    """
    Main ingestion function.
    Fetches unprocessed emails, classifies, extracts, stores.
    """
    result = IngestionResult()

    def _log(msg: str):
        result.log.append(msg)
        if status_callback:
            status_callback(msg)
        logger.info("[Gmail] %s", msg)

    # Get valid access token
    access_token = get_valid_access_token(user_id)
    if not access_token:
        _log("ERROR: No valid Gmail access token. Please connect Gmail first.")
        return result

    # Get already-processed message IDs
    already_processed = get_already_processed_ids(user_id)
    _log(f"Already processed: {len(already_processed)} emails")

    # Fetch recent messages
    _log("Fetching messages from Gmail...")
    try:
        messages_data = list_messages(access_token, query=SUPPLIER_QUERY, max_results=max_emails)
    except Exception as e:
        _log(f"ERROR fetching messages: {e}")
        return result

    messages = messages_data.get("messages", [])
    result.fetched = len(messages)
    _log(f"Found {len(messages)} messages to check")

    for msg_ref in messages:
        msg_id = msg_ref["id"]

        # Skip already processed
        if msg_id in already_processed:
            result.skipped_already_processed += 1
            continue

        try:
            # Get full message
            message = get_message(access_token, msg_id)
            meta = get_message_metadata(message)
            body = extract_email_body(message)
            attachments = extract_attachments(message)

            _log(f"\nProcessing: {meta['subject'][:60]} | From: {meta['from'][:40]}")

            # Classify the email
            classification = classify_email(
                subject=meta["subject"],
                body=body,
                sender=meta["from"],
            )
            category = classification.get("category", "IRRELEVANT")
            supplier_name = classification.get("supplier_name", "Unknown Supplier")
            confidence = classification.get("confidence", 0)

            _log(f"  → Category: {category} (confidence: {confidence:.0%})")

            if category == "IRRELEVANT" or confidence < 0.5:
                mark_processed(user_id, msg_id, meta["thread_id"], "irrelevant", supplier_name)
                result.skipped_irrelevant += 1
                continue

            if category not in EXTRACTABLE_CATEGORIES:
                mark_processed(user_id, msg_id, meta["thread_id"], category.lower(), supplier_name)
                continue

            # Extract text from attachments
            attachment_text = ""
            for att in attachments:
                _log(f"  Downloading attachment: {att['filename']}")
                try:
                    att_bytes = get_attachment(access_token, msg_id, att["attachment_id"])
                    att_text = extract_text_from_attachment(att_bytes, att["filename"])
                    if att_text:
                        attachment_text += f"\n\n--- Attachment: {att['filename']} ---\n{att_text}"
                except Exception as e:
                    _log(f"  WARNING: Could not process attachment {att['filename']}: {e}")

            # Extract structured data
            source_date = meta["date"][:10] if meta["date"] else None
            extracted = extract_supplier_data(
                body=body,
                subject=meta["subject"],
                sender=meta["from"],
                supplier_name=supplier_name,
                source_email_id=msg_id,
                source_date=source_date,
                attachment_text=attachment_text,
            )

            hotels = extracted.get("hotels", [])
            activities = extracted.get("activities", [])
            transfers = extracted.get("transfers", [])

            total_extracted = len(hotels) + len(activities) + len(transfers)
            _log(f"  Extracted: {len(hotels)} hotels, {len(activities)} activities, {len(transfers)} transfers")

            if total_extracted > 0:
                _insert_hotels(hotels, result)
                _insert_activities(activities, result)
                _insert_transfers(transfers, result)
                result.extracted += 1
                mark_processed(user_id, msg_id, meta["thread_id"], "processed", supplier_name, category)
            else:
                _log("  No structured data extracted")
                mark_processed(user_id, msg_id, meta["thread_id"], "no_data", supplier_name, category)

        except Exception as e:
            logger.error("Error processing message %s: %s", msg_id, e)
            _log(f"  ERROR: {e}")
            result.errors += 1

    summary = (
        f"\nIngestion complete: "
        f"{result.extracted} emails extracted | "
        f"{result.hotels_added} hotels | "
        f"{result.activities_added} activities | "
        f"{result.transfers_added} transfers | "
        f"{result.errors} errors"
    )
    _log(summary)
    return result
