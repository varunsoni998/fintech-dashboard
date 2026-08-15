import os
import uuid
import base64
import requests

OUTPUT_DIR = "outputs/images"
os.makedirs(OUTPUT_DIR, exist_ok=True)

CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")


def generate_image(image_prompt):
    final_prompt = f"""
{image_prompt}
Ultra photorealistic. Luxury travel commercial. RAW photograph. 8K. HDR.
Natural colors. Professional travel photography. No illustration. No CGI. Real photograph.
"""

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell"

    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
        json={"prompt": final_prompt.strip(), "num_steps": 8},
        timeout=60,
    )

    if not response.ok:
        raise Exception(f"Cloudflare image generation failed: {response.text}")

    data = response.json()
    image_b64 = data["result"]["image"]
    image_bytes = base64.b64decode(image_b64)

    # Cloudflare returns JPEG data
    save_path = os.path.join(OUTPUT_DIR, f"{uuid.uuid4()}.jpg")
    with open(save_path, "wb") as f:
        f.write(image_bytes)

    return save_path.replace("\\", "/")