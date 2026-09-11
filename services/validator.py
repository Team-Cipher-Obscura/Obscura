import json
import re
from pydantic import ValidationError
from model import AgentResponse

class VLMOutputError(Exception):
    """Raised whenever the VLM's response can't be trusted as-is."""
    pass

def extract_json(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise VLMOutputError(f"VLM did not return valid JSON: {e}")

def validate_metadata_shape(action) -> None:
    meta = action.metadata
    if action.action == "type" and "value" not in meta:
        raise VLMOutputError("type action missing required metadata.value")
    if action.action == "navigate" and "url" not in meta:
        raise VLMOutputError("navigate action missing required metadata.url")
    if action.action == "scroll" and ("direction" not in meta or "amount" not in meta):
        raise VLMOutputError("scroll action missing required metadata.direction/amount")

def parse_and_validate(raw_text: str, valid_element_ids: set[str]) -> AgentResponse:
    data = extract_json(raw_text)
    try:
        action = AgentResponse(**data)
    except ValidationError as e:
        raise VLMOutputError(f"VLM JSON didn't match expected schema: {e}")

    if action.target_id is not None and action.target_id not in valid_element_ids:
        raise VLMOutputError(f"VLM invented a target_id not in the element list: {action.target_id}")

    validate_metadata_shape(action)
    return action