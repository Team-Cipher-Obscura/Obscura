import logging
from fastapi import FastAPI, HTTPException
from Obscura.model import AgentRequest, AgentResponse
from Obscura.services.prompt_builder import build_prompt
from Obscura.services.vlm import call_vlm
from Obscura.services.validator import parse_and_validate, VLMOutputError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agent")

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/agent/reason", response_model=AgentResponse)
def reason(payload: AgentRequest):
    logger.info("task=%s num_elements=%d", payload.task, len(payload.elements))
    prompt = build_prompt(payload.task, payload.elements, payload.sanitized_regions)

    try:
        raw = call_vlm(prompt, payload.screenshot)
    except Exception as e:
        logger.error("VLM call failed: %s", e)
        raise HTTPException(status_code=504, detail="VLM request failed or timed out")

    valid_ids = {e.id for e in payload.elements}
    try:
        action = parse_and_validate(raw, valid_ids)
    except VLMOutputError as e:
        logger.error("Invalid VLM output: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    logger.info("action=%s target_id=%s confidence=%.2f", action.action, action.target_id, action.confidence)
    return action