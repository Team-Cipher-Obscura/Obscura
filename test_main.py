from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

VALID_PAYLOAD = {
    "frame_id": "f_00042",
    "task": "Find Mumbai flight",
    "elements": [
        {"id": "el_a91f3c", "tag": "input", "type": "password", "role": "textbox",
         "text": "[REDACTED_PASSWORD]", "bbox": [420,650,100,40],
         "confidence": 0.98, "sensitive": True, "sensitive_type": "password_field",
         "detected_by": "dom_attribute"},
        {"id": "el_b02e7d", "tag": "button", "type": None, "role": "button",
         "text": "Submit", "bbox": [420,700,100,40], "confidence": 0.98, "sensitive": False},
    ],
    "sanitized_regions": [],
    "screenshot": None,
}

def test_valid_request_returns_200():
    resp = client.post("/agent/reason", json=VALID_PAYLOAD)
    assert resp.status_code == 200

def test_missing_task_returns_422():
    bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "task"}
    resp = client.post("/agent/reason", json=bad)
    assert resp.status_code == 422

def test_missing_elements_returns_422():
    bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "elements"}
    resp = client.post("/agent/reason", json=bad)
    assert resp.status_code == 422