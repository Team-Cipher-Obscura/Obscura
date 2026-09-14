import json
from model import Element

def build_prompt(task: str, elements: list[Element]) -> str:
    elements_json = json.dumps([e.model_dump() for e in elements])

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

The screenshot provided has already had faces and sensitive regions blurred — treat
any blurred areas as non-targetable and do not attempt to read anything under them.

SUPPORTED ACTIONS: click, type, scroll, navigate, wait, done

Use "done" only when the current screen already shows clear evidence the task has
been accomplished (e.g. a confirmation message, a results page matching the task,
a success state) — not just that a prior action might lead there eventually. This
is a terminal signal: once you return "done", you will not be called again for
this task, so only use it when you are confident the task is genuinely finished.

Rules:
1. Choose exactly one action that makes progress toward the task, or "done" if it
   is already complete.
2. target_id MUST be one of the IDs listed above, or null. "done" always uses null.
3. Never invent a target_id that isn't in the list.
4. Respond with exactly this JSON shape and nothing else:
{{"action": "<click|type|scroll|navigate|wait|done>", "target_id": "<id or null>", "confidence": <0.0-1.0>, "metadata": {{...}}}}

metadata rules by action:
- type: {{"value": "<text to type>"}}
- navigate: {{"url": "<url>"}}
- scroll: {{"direction": "up"|"down", "amount": <pixels>}}
- click, wait: {{}}
- done: {{"reason": "task_completed"}}
"""