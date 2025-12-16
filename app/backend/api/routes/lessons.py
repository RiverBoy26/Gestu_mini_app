from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from api.deps import get_db, get_current_user
from db.models import Lesson, GestureCard
from app.backend.api.schemas import LessonOut, GestureCardOut

router = APIRouter(prefix="/api/v1", tags=["lessons"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/lessons", response_model=list[LessonOut])
def list_lessons(db: Session = Depends(get_db), user = Depends(get_current_user)):
    return db.query(Lesson).order_by(Lesson.lesson_order).all()


@router.get("/lessons/{lesson_id}/cards", response_model=list[GestureCardOut])
def list_cards(lesson_id: int, db: Session = Depends(get_db), user = Depends(get_current_user)):
    return db.query(GestureCard).filter_by(lesson_id=lesson_id).all()
