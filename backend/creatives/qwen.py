import os
import re
import json
import base64
import requests

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Free model on OpenRouter — swap to any other free model if needed
MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


def safe_parse(text):
    text = re.sub(r"```json", "", text)
    text = re.sub(r"```", "", text)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise Exception("No JSON array found.\n\nReturned:\n" + text)
    return json.loads(text[start:end + 1])


def _chat(messages, timeout=120):
    response = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": MODEL, "messages": messages},
        timeout=timeout,
    )
    if not response.ok:
        raise Exception(f"OpenRouter error: {response.text}")
    return response.json()["choices"][0]["message"]["content"]


def generate_storyboard(destination):
    print("\nGenerating storyboard for:", destination)

    system_prompt = f"""
You are a world-class luxury travel cinematographer who has personally visited {destination} many times.

Create a 10-scene visual storyboard for a high-end travel campaign about {destination}.

Return ONLY a valid JSON array. No markdown. No explanation. No preamble.

Format:
[
  {{
    "scene": 1,
    "image_prompt": "",
    "video_prompt": ""
  }}
]

STRICT RULES FOR image_prompt:
- Use EXACT real names of famous landmarks/locations specific to {destination}
- Include time of day, camera details, lighting, weather, color palette
- NO people, NO tourists, NO crowds, NO faces
- Only real, photographic, documentary-style travel imagery

STRICT RULES FOR video_prompt:
- Start with "Animate:"
- Only natural physical motion (water, wind, clouds, camera drift)
- 2-3 sentences max

SCENE VARIETY:
1. Most iconic landmark - wide shot at golden hour
2. Famous natural landscape or water body
3. Renowned architectural interior or detail
4. Famous local cuisine - extreme close up
5. Historic street or market - empty, dawn light
6. Aerial drone cityscape or landscape
7. Sacred or cultural site
8. Famous viewpoint or panoramic vista
9. {destination} at night - lit landmark
10. Hidden gem or lesser-known beautiful location
"""

    content = _chat([{"role": "user", "content": system_prompt}], timeout=180)
    print("Raw response preview:", content[:300])
    result = safe_parse(content)
    print(f"Parsed {len(result)} scenes successfully")
    return result


def analyze_uploaded_image(image_path: str) -> dict:
    print("\nAnalyzing uploaded image:", image_path)

    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")

    ext = image_path.lower().split(".")[-1]
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else "image/png"

    prompt = """
Analyze this travel photograph and return ONLY a valid JSON object. No markdown.

Format:
{
  "image_prompt": "",
  "video_prompt": ""
}

For image_prompt: describe the specific location, architecture, landscape, lighting, colors,
camera angle. Write as a detailed photographic description. NO people or faces.

For video_prompt: Start with "Animate:" then describe subtle natural motion (water, wind,
clouds, gentle camera drift). 2-3 sentences max.
"""

    try:
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_data}"}},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        content = _chat(messages, timeout=120)
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
        content = re.sub(r"```json|```", "", content).strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > 0:
            result = json.loads(content[start:end])
            if result.get("image_prompt") and result.get("video_prompt"):
                return result
    except Exception as e:
        print("Vision analysis failed:", e)

    # Fallback
    return {
        "image_prompt": "Breathtaking travel destination at golden hour. Wide aerial perspective. Ultra photorealistic RAW photograph. 8K. No people.",
        "video_prompt": "Animate: Gentle wind moves through the scene. Clouds drift slowly. Camera slowly pushes forward.",
    }