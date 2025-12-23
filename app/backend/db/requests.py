from . import get_session
from .models import User, Lesson


def add_user(telegram_id: int, username: str | None):
    session = get_session()
    new_user = User(
        telegram_id=telegram_id,
        username=username,
    )
    session.add(new_user)
    session.commit()
    session.close()


def add_lesson(title: str, description: str, content_url: str, lesson_order: int):
    session = get_session()
    new_lesson = Lesson(title=title, description=description, content_url=content_url, lesson_order=lesson_order)
    session.add(new_lesson)
    session.commit()
    session.close()


def get_all_lessons():
    session = get_session()
    lessons = session.query(Lesson).all()
    session.close()
    return lessons
