import logging
from fastapi import FastAPI, HTTPException
from model import AgentRequest, AgentResponse
from services.prompt_builder import build_prompt
from services.vlm import call_vlm
from services.validator import parse_and_validate, VLMOutputError
from services.status import make_status

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent")

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}

CONFIDENCE_THRESHOLD = 0.5

@app.post("/agent/reason", response_model=AgentResponse)
def reason(payload: AgentRequest):
    logger.info("task=%s num_elements=%d", payload.task, len(payload.elements))
    logger.info("status=%s", make_status("processing", payload.task))
    prompt = build_prompt(payload.task, payload.elements)

    try:
        raw = call_vlm(prompt, payload.screenshot)
    except Exception as e:
        logger.error("status=%s", make_status("error", payload.task, str(e)))
        raise HTTPException(status_code=504, detail="VLM request failed or timed out")

    valid_ids = {e.id for e in payload.elements}
    try:
        action = parse_and_validate(raw, valid_ids)
    except VLMOutputError as e:
        logger.error("Invalid VLM output: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    if action.confidence < CONFIDENCE_THRESHOLD:
        logger.warning("Low confidence (%.2f) — returning wait instead of %s", action.confidence, action.action)
        action = AgentResponse(action="wait", target_id=None, confidence=action.confidence, metadata={})

    logger.info("action=%s target_id=%s confidence=%.2f", action.action, action.target_id, action.confidence)
    return action