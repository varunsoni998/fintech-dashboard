import os
import uuid
import json
import requests

from creatives.utils import submit, wait
from creatives.workflows import load_workflow

COMFY = "https://doorbell-scant-snowy.ngrok-free.app"

OUTPUT = "outputs/videos"

os.makedirs(OUTPUT, exist_ok=True)


def generate_video_from_text(prompt):
    """
    Generates a video directly from a text prompt using the ttv.json
    workflow (LTX 2.3 running in its native text-to-video path — no
    source image is uploaded or required).

    The workflow has a "Switch to Text to Video?" boolean node that
    toggles between the img2video and pure text2video branches; we
    force it to True here since this function never has an image.
    """

    print("\n")
    print("=" * 100)
    print("TEXT-TO-VIDEO GENERATION")
    print("=" * 100)

    print("\nPROMPT:")
    print(prompt)

    workflow = load_workflow("ttv.json")

    final_prompt = f"""
{prompt}

Ultra photorealistic.
Luxury travel commercial quality.
Cinematic. Slow. Meditative. Peaceful.
Natural, smooth, physically accurate motion.
8K. HDR. Perfect temporal consistency — no flickering, no morphing.
No watermark. No logos. No subtitles. No on-screen text.
"""

    prompt_node = None
    switch_node = None

    for key, value in workflow.items():
        if not isinstance(value, dict):
            continue

        if value.get("class_type") == "PrimitiveStringMultiline":
            prompt_node = key

        if (
            value.get("class_type") == "PrimitiveBoolean"
            and value.get("_meta", {}).get("title") == "Switch to Text to Video?"
        ):
            switch_node = key

    if prompt_node is None:
        raise Exception("PrimitiveStringMultiline node not found in workflow.")

    workflow[prompt_node]["inputs"]["value"] = final_prompt

    if switch_node is not None:
        workflow[switch_node]["inputs"]["value"] = True

    print("\n")
    print("=" * 100)
    print("WORKFLOW READY")
    print("=" * 100)
    print("PROMPT NODE:", prompt_node)
    print("SWITCH NODE:", switch_node)

    prompt_id = submit(workflow)

    print("\nWAITING FOR TTV VIDEO GENERATION...\n")

    result = wait(prompt_id)

    outputs = result.get("outputs", {})

    print("\n")
    print("=" * 100)
    print("COMFY OUTPUTS")
    print("=" * 100)
    print(json.dumps(outputs, indent=4))

    for node_id, node in outputs.items():

        video = None

        if "videos" in node:
            video = node["videos"][0]

        elif "gifs" in node:
            video = node["gifs"][0]

        elif "images" in node:
            for item in node["images"]:
                fname = item.get("filename", "")
                if fname.lower().endswith(".mp4"):
                    video = item
                    break

        if video is None:
            continue

        print("\n")
        print("=" * 100)
        print("VIDEO FOUND")
        print("=" * 100)
        print(video)

        filename = video["filename"]
        subfolder = video.get("subfolder", "")

        url = (
            f"{COMFY}/view?"
            f"filename={filename}"
            f"&subfolder={subfolder}"
            f"&type=output"
        )

        print("\nDOWNLOAD URL:")
        print(url)

        response = requests.get(url)
        response.raise_for_status()

        new_filename = f"{uuid.uuid4()}.mp4"
        save_path = os.path.join(OUTPUT, new_filename)

        with open(save_path, "wb") as f:
            f.write(response.content)

        print("\n")
        print("=" * 100)
        print("VIDEO SAVED")
        print("=" * 100)
        print(save_path)

        frontend_path = f"outputs/videos/{new_filename}"

        print("\nRETURNING:")
        print(frontend_path)

        return frontend_path

    print("\n")
    print("=" * 100)
    print("VIDEO ERROR")
    print("=" * 100)
    print("No video found in ComfyUI outputs.")

    raise Exception("No video found in ComfyUI outputs.")