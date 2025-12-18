from pydantic import BaseModel
from typing import Optional
from .category import CategoryOut


class LessonOut(BaseModel):
    lesson_id: int
    title: str
    description: Optional[str] = None
    content_url: Optional[str] = None
    lesson_order: int
    category: CategoryOut

    class Config:
        orm_mode = True
