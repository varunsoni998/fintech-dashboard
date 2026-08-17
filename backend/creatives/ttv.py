import os
import time
import uuid
import json
import threading
import requests

from creatives.utils import submit, wait
from creatives.workflows import load_workflow

COMFY = "https://doorbell-scant-snowy.ngrok-free.dev"

OUTPUT = "outputs/videos"

os.makedirs(OUTPUT, exist_ok=True)


def _extract_public_url(get_public_url_result, bucket: str, filename: str) -> str:
    """
    Normalizes the return value of supabase.storage.from_(bucket).get_public_url(filename)
    across supabase-py / storage3 versions.

    - Newer clients (storage3 >= 0.7 / supabase-py v2): returns a plain str.
    - Older clients: can return a dict like {"publicUrl": ...} or
      {"data": {"publicUrl": ...}} or an object with a .public_url attribute.
    """
    result = get_public_url_result

    if isinstance(result, str) and result:
        return result

    if isinstance(result, dict):
        candidate = (
            result.get("publicUrl")
            or result.get("publicURL")
            or result.get("public_url")
        )
        if candidate:
            return candidate
        nested = result.get("data")
        if isinstance(nested, dict):
            candidate = (
                nested.get("publicUrl")
                or nested.get("publicURL")
                or nested.get("public_url")
            )
            if candidate:
                return candidate

    for attr in ("public_url", "publicUrl", "publicURL"):
        candidate = getattr(result, attr, None)
        if candidate:
            return candidate

    raise Exception(
        f"Could not resolve a public URL from Supabase for '{filename}' in bucket "
        f"'{bucket}'. get_public_url() returned: {result!r}. "
        f"Also double-check that the '{bucket}' bucket is marked Public in the "
        f"Supabase dashboard (Storage -> {bucket} -> Configuration)."
    )


def _upload_video_to_supabase(local_path: str, new_filename: str) -> str:
    from supabase_client import supabase

    bucket = "videos"

    with open(local_path, "rb") as f:
        upload_response = supabase.storage.from_(bucket).upload(
            path=new_filename,
            file=f,
            file_options={"content-type": "video/mp4"},
        )

    # Some client versions return an object/dict with an "error" field instead
    # of raising on failure — catch that explicitly so a bad upload never
    # silently proceeds to a dead public URL.
    upload_error = None
    if isinstance(upload_response, dict):
        upload_error = upload_response.get("error")
    else:
        upload_error = getattr(upload_response, "error", None)
    if upload_error:
        raise Exception(f"Supabase upload failed for '{new_filename}': {upload_error}")

    public_url_result = supabase.storage.from_(bucket).get_public_url(new_filename)
    public_url = _extract_public_url(public_url_result, bucket, new_filename)

    print("\nSUPABASE PUBLIC URL:")
    print(public_url)

    return public_url


def generate_video_from_text(prompt):
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

        # Upload to Supabase and return public URL
        public_url = _upload_video_to_supabase(save_path, new_filename)

        # Delete from Supabase after 1 hour and clean up local file
        def cleanup(fname, local_path):
            time.sleep(3600)
            try:
                from supabase_client import supabase
                supabase.storage.from_("videos").remove([fname])
                print(f"Deleted from Supabase: {fname}")
            except Exception as e:
                print(f"Supabase delete failed: {e}")
            try:
                os.remove(local_path)
                print(f"Deleted local file: {local_path}")
            except Exception as e:
                print(f"Local delete failed: {e}")

        threading.Thread(target=cleanup, args=(new_filename, save_path), daemon=True).start()

        print("\nRETURNING:")
        print(public_url)

        return public_url

    print("\n")
    print("=" * 100)
    print("VIDEO ERROR")
    print("=" * 100)
    print("No video found in ComfyUI outputs.")

    raise Exception("No video found in ComfyUI outputs.")