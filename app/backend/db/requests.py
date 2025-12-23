from . import get_session
from .models import User, Lesson


def add_user(telegram_id: int, username: str | None):
    session = get_session()

    user = session.query(User).filter_by(telegram_id=telegram_id).first()
    if user:
        if username and user.username != username:
            user.username = username
            session.commit()
        session.close()
        return user

    user = User(
        telegram_id=telegram_id,
        username=username,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    session.close()
    return user


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
