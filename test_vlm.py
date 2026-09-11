from Obscura.services.prompt_builder import build_prompt
from Obscura.services.vlm import call_vlm
from Obscura.model import Element, SanitizedRegion

elements = [
    Element(id="el_001", type="input", text="[REDACTED_EMAIL]", bbox=[100,200,220,32],
            confidence=0.95, sensitive=True, sensitive_type="email", detected_by="regex"),
    Element(id="el_002", type="button", text="Continue", bbox=[100,260,100,40],
            confidence=0.98, sensitive=False),
]

prompt = build_prompt("Find Mumbai flight", elements, [])
raw_response = call_vlm(prompt, screenshot_b64=None)  # no real screenshot yet — text-only test first
print(raw_response)