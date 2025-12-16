from pydantic import BaseModel
from typing import Optional


class LessonOut(BaseModel):
    lesson_id: int
    title: str
    description: Optional[str] = None
    lesson_order: int

    class Config:
        orm_mode = True
