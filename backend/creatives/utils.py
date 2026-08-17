import os
import time
import uuid
import requests

COMFY_URL = "https://doorbell-scant-snowy.ngrok-free.app"

# ----------------------------------
# Submit workflow to ComfyUI
# ----------------------------------
def submit(workflow):
    response = requests.post(
        f"{COMFY_URL}/prompt",
        json={"prompt": workflow},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    if "prompt_id" not in data:
        raise Exception(f"ComfyUI error:\n{data}")
    return data["prompt_id"]

# ----------------------------------
# Wait until generation finishes
# ----------------------------------
def wait(prompt_id):
    while True:
        response = requests.get(
            f"{COMFY_URL}/history/{prompt_id}",
            timeout=30,
        )
        response.raise_for_status()
        history = response.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(3)

# ----------------------------------
# Upload image to ComfyUI via API
# (works from Render — no local path needed)
# ----------------------------------
def push_image(image_path):
    ext = os.path.splitext(image_path)[1] or ".jpg"
    new_filename = f"{uuid.uuid4()}{ext}"
    with open(image_path, "rb") as f:
        files = {"image": (new_filename, f, "image/jpeg")}
        response = requests.post(
            f"{COMFY_URL}/upload/image",
            files=files,
            timeout=60,
        )
        response.raise_for_status()
    return response.json()["name"]