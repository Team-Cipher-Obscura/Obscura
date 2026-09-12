import json
import re
from pydantic import ValidationError
from model import AgentResponse, Element

class VLMOutputError(Exception):
    """Raised whenever the VLM's response can't be trusted as-is."""
    pass

class SensitiveActionBlocked(VLMOutputError):
    """
    Raised when the VLM tries to 'type' into a field P4 marked as sensitive.

    This is NOT a malformed-output error — the VLM behaved exactly as expected.
    It's a deliberate privacy guardrail: since sensitive element text is redacted
    before it ever reaches the model, any 'value' the VLM proposes for a sensitive
    field is necessarily fabricated, not real user data. We block it here and hand
    control back to the user rather than let a hallucinated value reach the browser.
    """
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

def parse_and_validate(raw_text: str, elements: list[Element]) -> AgentResponse:
    valid_element_ids = {e.id for e in elements}
    sensitive_element_ids = {e.id for e in elements if e.sensitive}

    data = extract_json(raw_text)
    try:
        action = AgentResponse(**data)
    except ValidationError as e:
        raise VLMOutputError(f"VLM JSON didn't match expected schema: {e}")

    if action.target_id is not None and action.target_id not in valid_element_ids:
        raise VLMOutputError(f"VLM invented a target_id not in the element list: {action.target_id}")

    if action.action == "type" and action.target_id in sensitive_element_ids:
        raise SensitiveActionBlocked(
            f"VLM tried to type into sensitive element '{action.target_id}'. "
            "Blocked — this data was never sent to the model, so any value would be fabricated."
        )

    validate_metadata_shape(action)
    return action