from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_db, get_current_user
from app.backend.db.models import Category, Lesson
from app.backend.api.schemas.category import CategoryOut
from app.backend.api.schemas.lesson import LessonOut

router = APIRouter(prefix="/api/v1", tags=["categories"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Category).order_by(Category.category_order, Category.category_id).all()


@router.get("/categories/{slug}/lessons", response_model=list[LessonOut])
def list_category_lessons(slug: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = db.query(Category).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Category not found")
    return db.query(Lesson).filter_by(category_id=c.category_id).order_by(Lesson.lesson_order).all()
