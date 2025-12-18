from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SessionStartIn(BaseModel):
    lesson_id: int


class SessionStartOut(BaseModel):
    session_id: int
    session_start: datetime


class SessionFinishIn(BaseModel):
    result: str
    session_end: Optional[datetime] = None
