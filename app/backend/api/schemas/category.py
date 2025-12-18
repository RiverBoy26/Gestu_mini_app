from pydantic import BaseModel


class CategoryOut(BaseModel):
    category_id: int
    slug: str
    title: str
    category_order: int

    class Config:
        orm_mode = True