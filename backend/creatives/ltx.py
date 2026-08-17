import os
import uuid
import json
import requests

from creatives.utils import submit, wait, push_image
from creatives.workflows import load_workflow

COMFY = "https://doorbell-scant-snowy.ngrok-free.dev"

OUTPUT = "outputs/videos"

os.makedirs(OUTPUT, exist_ok=True)


def generate_video_from_image(
    image_path,
    image_prompt,
    video_prompt,
):

    print("\n")
    print("=" * 100)
    print("VIDEO GENERATION")
    print("=" * 100)

    print("IMAGE PATH:")
    print(image_path)

    print("\nIMAGE PROMPT:")
    print(image_prompt)

    print("\nVIDEO PROMPT:")
    print(video_prompt)

    workflow = load_workflow("ltx23.json")

    filename = push_image(image_path)

    final_prompt = f"""
You are animating an EXISTING IMAGE into a slow, cinematic luxury travel video.

The uploaded image is the ONLY reference. Do not change anything about it.

STRICT RULES — NEVER VIOLATE:

Do NOT speed up any motion.
Do NOT create fast cuts or transitions.
Do NOT add people or crowds that are not in the original image.
Do NOT change the location, architecture, landscape, or objects.
Do NOT change the colors, lighting, or atmosphere.
Do NOT change the composition or framing.
Do NOT morph, hallucinate, or replace any element.
Do NOT create any artificial or CGI-looking motion.
The first frame MUST be identical to the uploaded photograph.

MOTION STYLE — STRICTLY SLOW AND CINEMATIC:

All motion must be extremely slow, smooth, and graceful.
Think: luxury hotel commercial, National Geographic documentary, Condé Nast Traveller film.
Motion speed should feel like time is moving at 0.3x normal speed.
Every movement should feel deliberate, peaceful, and meditative.
The video should feel like a living photograph, not an animation.

ALLOWED MOTION TYPES (choose only what fits the scene):

• Extremely slow camera push forward — barely perceptible drift into the scene
• Gentle, almost imperceptible camera tilt upward revealing sky
• Ultra-slow parallax effect — foreground elements drift slightly slower than background
• Clouds drifting slowly across the sky — very slow, like watching a time-lapse in reverse
• Water surface shimmering slowly — subtle light reflections moving gently
• River or waterfall flowing — slow and smooth, not rushing
• Leaves or trees swaying gently in a soft breeze — very minimal movement
• Flags or fabric rippling slowly in wind — smooth and graceful
• Steam or mist rising slowly — ethereal, dreamlike
• Golden light slowly shifting — as if the sun is moving just slightly
• Shadows creeping very slowly across architecture
• Birds gliding silently in the distance — far away, slow arcs

IMAGE DESCRIPTION (what is in the photograph):
{image_prompt}

SPECIFIC ANIMATION REQUIRED:
{video_prompt}

FINAL QUALITY REQUIREMENTS:

Ultra photorealistic.
Luxury travel commercial quality.
Cinematic. Slow. Meditative. Peaceful.
8K. HDR. Natural physics.
Perfect temporal consistency — no flickering, no morphing.
The scene must feel alive but completely still at the same time.
Like a photograph that learned to breathe.
"""

    image_node = None
    prompt_node = None
    for key, value in workflow.items():

        if not isinstance(value, dict):
            continue

        if value.get("class_type") == "LoadImage":
            image_node = key

        if value.get("class_type") == "PrimitiveStringMultiline":
            prompt_node = key

    if image_node is None:
        raise Exception("LoadImage node not found in workflow.")

    if prompt_node is None:
        raise Exception("PrimitiveStringMultiline node not found in workflow.")

    workflow[image_node]["inputs"]["image"] = filename
    workflow[prompt_node]["inputs"]["value"] = final_prompt

    print("\n")
    print("=" * 100)
    print("WORKFLOW READY")
    print("=" * 100)

    print("IMAGE NODE:", image_node)
    print("PROMPT NODE:", prompt_node)
    print("UPLOADED IMAGE:", filename)

    prompt_id = submit(workflow)

    print("\nWAITING FOR LTX VIDEO GENERATION...\n")

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