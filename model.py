from pydantic import BaseModel, field_validator
from typing import Optional, List, Literal
import base64

class Element(BaseModel):
    id: str
    tag: str
    type: Optional[str] = None
    role: Optional[str] = None
    text: Optional[str] = None
    bbox: List[float]
    confidence: Optional[float] = None
    sensitive: bool = False
    sensitive_type: Optional[str] = None
    detected_by: Optional[str] = None
    changed: Optional[bool] = None

class AgentRequest(BaseModel):
    frame_id: Optional[str] = None
    task: str
    elements: List[Element]
    screenshot: Optional[str] = None

    @field_validator("screenshot")
    @classmethod
    def validate_screenshot(cls, v):
        if v is None:
            return v
        try:
            base64.b64decode(v, validate=True)
        except Exception:
            raise ValueError("screenshot must be valid base64")
        return v

class AgentResponse(BaseModel):
    action: Literal["click", "type", "scroll", "navigate", "wait"]
    target_id: Optional[str] = None
    confidence: float
    metadata: dict = {}

class StatusUpdate(BaseModel):
    status: Literal["processing", "action_ready", "error"]
    task: str
    message: Optional[str] = None