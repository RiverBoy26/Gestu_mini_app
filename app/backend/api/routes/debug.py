from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.backend.api.deps import get_db
from app.backend.db.models import Category, Lesson

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.get("/categories")
def debug_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.category_order).all()


@router.get("/lessons")
def debug_lessons(db: Session = Depends(get_db)):
    categories = db.query(Category).order_by(Category.category_order).all()
    result = []

    for c in categories:
        lessons = (
            db.query(Lesson)
            .filter(Lesson.category_id == c.category_id)
            .order_by(Lesson.lesson_order)
            .all()
        )

        result.append({
            "category": {
                "id": c.category_id,
                "slug": c.slug,
                "title": c.title,
            },
            "lessons": [
                {
                    "lesson_id": l.lesson_id,
                    "lesson_order": l.lesson_order,
                    "title": l.title,
                    "description": l.description,
                    "content_url": l.content_url,
                }
                for l in lessons
            ],
        })

    return result
