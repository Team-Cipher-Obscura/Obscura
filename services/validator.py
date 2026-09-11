import json
import re
from pydantic import ValidationError
from Obscura.model import AgentResponse

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

def parse_and_validate(raw_text: str, valid_element_ids: set[str]) -> AgentResponse:
    data = extract_json(raw_text)
    try:
        action = AgentResponse(**data)
    except ValidationError as e:
        raise VLMOutputError(f"VLM JSON didn't match expected schema: {e}")

    if action.target_id is not None and action.target_id not in valid_element_ids:
        raise VLMOutputError(f"VLM invented a target_id not in the element list: {action.target_id}")

    return action