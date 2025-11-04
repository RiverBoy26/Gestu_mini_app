from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class LessonOut(BaseModel):
    lesson_id: int
    title: str
    description: Optional[str] = None
    lesson_order: int
    class Config: orm_mode = True


class GestureCardOut(BaseModel):
    card_id: int
    lesson_id: int
    gesture_name: str
    gesture_image_url: str
    class Config: orm_mode = True


class SessionStartIn(BaseModel):
    lesson_id: int


class SessionStartOut(BaseModel):
    session_id: int
    session_start: datetime


class SessionFinishIn(BaseModel):
    result: str
    session_end: Optional[datetime] = None


class DetectionIn(BaseModel):
    session_id: int
    gesture_card_id: int
    detection_accuracy: float
    detected_at: Optional[datetime] = None


class DetectionsBulkIn(BaseModel):
    items: List[DetectionIn]
