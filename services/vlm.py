from google import genai
from google.genai import types
from config import VLM_API_KEY, VLM_MODEL_NAME
import base64
import time


client = genai.Client(
    api_key=VLM_API_KEY,
    http_options=types.HttpOptions(
        timeout=120000  # 120 seconds
    )
)


def call_vlm(
    prompt: str,
    screenshot_b64: str | None,
    max_retries: int = 1
) -> str:

    contents = [prompt]
    image_bytes = b""

    if screenshot_b64:
        image_bytes = base64.b64decode(screenshot_b64)

        contents.append(
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            )
        )

    last_error = None

    for attempt in range(max_retries + 1):

        try:
            print(
                f"[P5 → VLM] Attempt {attempt + 1}"
            )

            print(
                f"[P5 → VLM] Model: {VLM_MODEL_NAME}"
            )

            print(
                f"[P5 → VLM] Screenshot size: "
                f"{len(image_bytes) / 1024 / 1024:.2f} MB"
            )

            start_time = time.time()

            response = client.models.generate_content(
                model=VLM_MODEL_NAME,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0,
                    max_output_tokens=100
                )
            )

            elapsed = time.time() - start_time

            print(
                f"[P5 → VLM] Response received "
                f"in {elapsed:.2f}s"
            )

            print(
                "[P5 → VLM] Response:",
                response.text
            )

            return response.text

        except Exception as e:

            last_error = e

            print(
                f"[P5 → VLM] ERROR: "
                f"{type(e).__name__}: {e}"
            )

            if attempt < max_retries:
                wait_time = 2 * (attempt + 1)

                print(
                    f"[P5 → VLM] Retrying in "
                    f"{wait_time}s..."
                )

                time.sleep(wait_time)

    raise last_error