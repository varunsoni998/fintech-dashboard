import os
import uuid
import base64
import requests

CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def generate_image(image_prompt: str) -> str:
    final_prompt = f"""
{image_prompt}
Ultra photorealistic. Luxury travel commercial. RAW photograph. 8K. HDR.
Natural colors. Professional travel photography. No illustration. No CGI. Real photograph.
"""

    # Generate image via Cloudflare
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
        json={"prompt": final_prompt.strip(), "num_steps": 8},
        timeout=60,
    )
    if not response.ok:
        raise Exception(f"Cloudflare failed: {response.text}")

    data = response.json()
    image_b64 = data["result"]["image"]
    image_bytes = base64.b64decode(image_b64)

    # Upload to Supabase Storage
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

    # Return public URL
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/generated-images/{filename}"
    return public_url