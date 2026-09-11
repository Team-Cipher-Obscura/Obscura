from pydantic import BaseModel
from typing import Optional, List, Literal

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

class SanitizedRegion(BaseModel):
    id: str
    sensitive_type: str
    bbox: List[float]
    confidence: float
    detected_by: str

class AgentRequest(BaseModel):
    frame_id: Optional[str] = None
    task: str
    elements: List[Element]
    sanitized_regions: List[SanitizedRegion] = []
    screenshot: Optional[str] = None

class AgentResponse(BaseModel):
    action: Literal["click", "type", "scroll", "navigate", "wait"]
    target_id: Optional[str] = None
    confidence: float
    metadata: dict = {}

class StatusUpdate(BaseModel):
    status: Literal["processing", "action_ready", "error"]
    task: str
    message: Optional[str] = None