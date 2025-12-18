from pydantic import BaseModel


class GestureCardOut(BaseModel):
    card_id: int
    lesson_id: int
    gesture_name: str
    gesture_image_url: str

    class Config:
        orm_mode = True
