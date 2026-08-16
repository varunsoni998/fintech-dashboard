import os
import uuid
import base64
import requests
import threading
import time


CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_EMAIL = os.getenv("CLOUDFLARE_EMAIL")
CF_GLOBAL_KEY = os.getenv("CLOUDFLARE_GLOBAL_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def delete_all_images():
    try:
        from supabase_client import supabase
        files = supabase.storage.from_("generated-images").list()
        if files:
            names = [f["name"] for f in files]
            supabase.storage.from_("generated-images").remove(names)
            print(f"Deleted {len(names)} old images from storage")
    except Exception as e:
        print(f"Cleanup error: {e}")


def cleanup_loop():
    # Delete immediately on startup
    delete_all_images()
    while True:
        time.sleep(3600)
        delete_all_images()


# Start cleanup thread
threading.Thread(target=cleanup_loop, daemon=True).start()


def generate_image(image_prompt: str) -> str:
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"

    response = requests.post(
        url,
        headers={
            "X-Auth-Email": CF_EMAIL,
            "X-Auth-Key": CF_GLOBAL_KEY,
            "Content-Type": "application/json",
        },
        json={"prompt": image_prompt.strip()},
        timeout=60,
    )

    if not response.ok:
        raise Exception(f"Cloudflare failed: {response.text}")

    data = response.json()
    image_b64 = data["result"]["image"]
    image_bytes = base64.b64decode(image_b64)

    filename = f"{uuid.uuid4()}.jpg"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/generated-images/{filename}"

    upload_res = requests.post(
        upload_url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "image/jpeg",
        },
        data=image_bytes,
        timeout=30,
    )

    if not upload_res.ok:
        raise Exception(f"Supabase upload failed: {upload_res.text}")

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/generated-images/{filename}"
    return public_url