from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch

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
    "screenshot": None
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

def test_low_confidence_returns_wait():
    fake_low_confidence_response = '{"action": "click", "target_id": "el_b02e7d", "confidence": 0.2, "metadata": {}}'
    with patch("main.call_vlm", return_value=fake_low_confidence_response):
        resp = client.post("/agent/reason", json=VALID_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "wait"
    assert body["target_id"] is None
    assert body["confidence"] == 0.2


def test_type_on_sensitive_field_is_blocked():
    fake_response = '{"action": "type", "target_id": "el_a91f3c", "confidence": 0.9, "metadata": {"value": "hallucinated_password"}}'
    with patch("main.call_vlm", return_value=fake_response):
        resp = client.post("/agent/reason", json=VALID_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "wait"
    assert body["target_id"] is None
    assert body["metadata"].get("reason") == "sensitive_field_requires_user"


def test_done_action_normalizes_metadata_and_clears_target():
    fake_response = '{"action": "done", "target_id": null, "confidence": 0.95, "metadata": {"reason": "looks finished"}}'
    with patch("main.call_vlm", return_value=fake_response):
        resp = client.post("/agent/reason", json=VALID_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "done"
    assert body["target_id"] is None
    # normalized to the stable string P1 matches on, regardless of what the VLM wrote
    assert body["metadata"] == {"reason": "task_completed"}


def test_done_action_with_target_id_is_rejected():
    # A "done" action must not carry a target_id — this is malformed VLM output,
    # so it follows the same path as any other invalid shape: 502, not a silent wait.
    fake_response = '{"action": "done", "target_id": "el_b02e7d", "confidence": 0.9, "metadata": {}}'
    with patch("main.call_vlm", return_value=fake_response):
        resp = client.post("/agent/reason", json=VALID_PAYLOAD)

    assert resp.status_code == 502


def test_all_unchanged_skips_vlm_call():
    payload = {
        "task": "Find Mumbai flight",
        "elements": [
            {"id": "el_c13f8a", "tag": "div", "role": "text", "text": "Flights",
             "bbox": [100,200,300,40], "confidence": 0.95, "sensitive": False, "changed": False},
        ],
        "screenshot": None
    }
    with patch("main.call_vlm") as mock_vlm:
        resp = client.post("/agent/reason", json=payload)
        mock_vlm.assert_not_called()

    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "wait"
    assert body["confidence"] == 1.0