import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from model import AgentRequest, AgentResponse
from services.prompt_builder import build_prompt
from services.vlm import call_vlm
from services.validator import parse_and_validate, VLMOutputError, SensitiveActionBlocked
from services.status import make_status

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent")

app = FastAPI()

# Allows the Chrome extension (content scripts run in a page's origin, e.g.
# chrome-extension://<id>) to call this API directly. Without this, browsers
# will silently block the fetch() with a CORS error before it ever reaches us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the extension's exact chrome-extension://<id> origin before submission if possible
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok"}

CONFIDENCE_THRESHOLD = 0.3

@app.post("/agent/reason", response_model=AgentResponse)
def reason(payload: AgentRequest):
    logger.info("task=%s num_elements=%d", payload.task, len(payload.elements))

    if payload.elements and all(e.changed is False for e in payload.elements):
        logger.info("No changed elements — skipping VLM call")
        return AgentResponse(action="wait", target_id=None, confidence=1.0, metadata={})

    logger.info("status=%s", make_status("processing", payload.task))
    prompt = build_prompt(payload.task, payload.elements)

    try:
        raw = call_vlm(prompt, payload.screenshot)
    except Exception as e:
        logger.error("status=%s", make_status("error", payload.task, str(e)))
        raise HTTPException(status_code=504, detail="VLM request failed or timed out")

    try:
        action = parse_and_validate(raw, payload.elements)
    except SensitiveActionBlocked as e:
        logger.warning("Blocked sensitive-field action, handing back to user: %s", e)
        return AgentResponse(action="wait", target_id=None, confidence=0.0, metadata={"reason": "sensitive_field_requires_user"})
    except VLMOutputError as e:
        logger.error("Invalid VLM output: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    if action.confidence < CONFIDENCE_THRESHOLD:
        logger.warning("Low confidence (%.2f) — returning wait instead of %s", action.confidence, action.action)
        action = AgentResponse(action="wait", target_id=None, confidence=action.confidence, metadata={})

    logger.info("action=%s target_id=%s confidence=%.2f", action.action, action.target_id, action.confidence)
    return action