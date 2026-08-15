import os
import time
import uuid
import shutil
import requests

COMFY_URL = "http://127.0.0.1:8188"


# ----------------------------------
# Submit workflow to ComfyUI
# ----------------------------------

def submit(workflow):

    response = requests.post(
        f"{COMFY_URL}/prompt",
        json={"prompt": workflow},
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
            f"{COMFY_URL}/history/{prompt_id}"
        )

        response.raise_for_status()

        history = response.json()

        if prompt_id in history:

            return history[prompt_id]

        time.sleep(1)


# ----------------------------------
# Copy image to ComfyUI input
# with UNIQUE filename
# ----------------------------------

def push_image(image_path):

    input_dir = r"C:\Users\ADMIN\Desktop\AI\ComfyUI\input"

    os.makedirs(input_dir, exist_ok=True)

    ext = os.path.splitext(image_path)[1]

    new_filename = f"{uuid.uuid4()}{ext}"

    target_path = os.path.join(
        input_dir,
        new_filename
    )

    shutil.copy2(
        image_path,
        target_path
    )

    return new_filename