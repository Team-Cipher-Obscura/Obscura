from google import genai
from google.genai import types
from config import VLM_API_KEY, VLM_MODEL_NAME
import base64

client = genai.Client(api_key=VLM_API_KEY)


def call_vlm(prompt: str, screenshot_b64: str | None) -> str:
    contents = [prompt]

    if screenshot_b64:
        image_bytes = base64.b64decode(screenshot_b64)

        contents.append(
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            )
        )

    response = client.models.generate_content(
        model=VLM_MODEL_NAME,
        contents=contents
    )

    return response.text