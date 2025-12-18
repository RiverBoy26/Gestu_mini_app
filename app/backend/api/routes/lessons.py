from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..deps import get_db, get_current_user
from db.models import Lesson, GestureCard, Category
from app.backend.api.schemas import LessonOut, GestureCardOut

router = APIRouter(prefix="/api/v1", tags=["lessons"])


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(Lesson).join(Category)
    if category:
        q = q.filter(Category.slug == category)
    return q.order_by(Category.category_order, Lesson.lesson_order).all()


@router.get("/lessons/{lesson_id}/cards", response_model=list[GestureCardOut])
def list_cards(lesson_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(GestureCard).filter_by(lesson_id=lesson_id).all()
