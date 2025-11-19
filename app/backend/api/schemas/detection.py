from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DetectionIn(BaseModel):
    session_id: int
    gesture_card_id: int
    detection_accuracy: float
    detected_at: Optional[datetime] = None


class DetectionsBulkIn(BaseModel):
    items: List[DetectionIn]
