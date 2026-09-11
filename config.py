import os
from dotenv import load_dotenv

load_dotenv()  # reads .env into environment variables

VLM_API_KEY = os.environ.get("VLM_API_KEY")
VLM_MODEL_NAME = os.environ.get("VLM_MODEL_NAME", "your-model-name-here")