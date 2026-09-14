import os
from dotenv import load_dotenv

load_dotenv()  # reads .env into environment variables

VLM_API_KEY = os.environ.get("VLM_API_KEY")
VLM_MODEL_NAME = os.environ.get("VLM_MODEL_NAME", "your-model-name-here")

if not VLM_API_KEY or VLM_API_KEY == "placeholder_for_now":
    raise RuntimeError("VLM_API_KEY is missing or still a placeholder — set it in .env")