import google.generativeai as genai
from config import VLM_API_KEY

genai.configure(api_key=VLM_API_KEY)
model = genai.GenerativeModel("gemini-2.0-flash")

def call_vlm(prompt: str, screenshot_b64: str | None) -> str:
    parts = [prompt]
    if screenshot_b64:
        import base64
        parts.append({"mime_type": "image/png", "data": base64.b64decode(screenshot_b64)})

    response = model.generate_content(
        parts,
        request_options={"timeout": 15},  # seconds — fail fast instead of hanging
    )
    return response.text