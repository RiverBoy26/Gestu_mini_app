from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.backend.db.models import Category, Lesson

DB_PATH = "gesture_language.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine)

def main():
    db = SessionLocal()

    print("\n=== CATEGORIES ===")
    categories = db.query(Category).all()
    print(f"Всего категорий: {len(categories)}")

    for c in categories:
        print(
            f"[Category] id={c.category_id} "
            f"slug={c.slug} "
            f"title={c.title} "
            f"order={c.category_order}"
        )

        lessons = (
            db.query(Lesson)
            .filter(Lesson.category_id == c.category_id)
            .order_by(Lesson.lesson_order)
            .all()
        )

        print(f"  └─ Уроков: {len(lessons)}")

        for l in lessons:
            print(
                f"     [Lesson] id={l.lesson_id} "
                f"order={l.lesson_order} "
                f"title='{l.title}' "
                f"description_len={len(l.description or '')} "
                f"content_url={l.content_url}"
            )

    db.close()
    print("\n=== END ===\n")


if __name__ == "__main__":
    main()