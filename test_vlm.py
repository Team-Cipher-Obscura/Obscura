from services.prompt_builder import build_prompt
from services.vlm import call_vlm
from model import Element

elements = [
    Element(id="el_001", tag="input", type="email", role="textbox", text="[REDACTED_EMAIL]",
            bbox=[100,200,220,32], confidence=0.95, sensitive=True,
            sensitive_type="email", detected_by="regex"),
    Element(id="el_002", tag="button", type=None, role="button", text="Continue",
            bbox=[100,260,100,40], confidence=0.98, sensitive=False),
]

prompt = build_prompt("Find Mumbai flight", elements)
raw_response = call_vlm(prompt, screenshot_b64=None)
print(raw_response)
assert raw_response