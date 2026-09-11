import json
from model import Element, SanitizedRegion

def build_prompt(task: str, elements: list[Element], sanitized_regions: list[SanitizedRegion]) -> str:
    elements_json = json.dumps([e.dict() for e in elements])
    regions_json = json.dumps([r.dict() for r in sanitized_regions])

    return f"""You are a browser automation assistant. Respond with ONLY a single JSON object — no prose, no markdown, no explanation.

TASK: {task}

AVAILABLE ELEMENTS (only these IDs may be used as target_id):
{elements_json}

Each element has "tag" (e.g. "input", "button") and "role" (e.g. "textbox", "button")
describing what kind of UI element it is. Use these to understand structure even when
"text" is redacted.

Some elements have "sensitive": true — their "text" field is already a placeholder
like "[REDACTED_PASSWORD]", not real content. You may still target them structurally
(e.g. click a login button) but never try to infer or repeat their real content.

BLURRED VISUAL REGIONS (not targetable, informational only — do not read anything under these):
{regions_json}

SUPPORTED ACTIONS: click, type, scroll, navigate, wait

Rules:
1. Choose exactly one action that makes progress toward the task.
2. target_id MUST be one of the IDs listed above, or null.
3. Never invent a target_id that isn't in the list.
4. Respond with exactly this JSON shape and nothing else:
{{"action": "<click|type|scroll|navigate|wait>", "target_id": "<id or null>", "confidence": <0.0-1.0>, "metadata": {{...}}}}

metadata rules by action:
- type: {{"value": "<text to type>"}}
- navigate: {{"url": "<url>"}}
- scroll: {{"direction": "up"|"down", "amount": <pixels>}}
- click, wait: {{}}
"""