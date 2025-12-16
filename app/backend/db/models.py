from sqlalchemy import Column, Integer, String, ForeignKey, Float, Text, DateTime, func
from sqlalchemy.orm import relationship
from . import Base


class User(Base):
    __tablename__ = 'users'

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(Integer, unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    avatar_url = Column(String(255), nullable=True)
    created_at = Column(DateTime(), server_default=func.now())


class Lesson(Base):
    __tablename__ = 'lessons'

    lesson_id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    content_url = Column(String(255), nullable=True)
    lesson_order = Column(Integer, nullable=False)
    created_at = Column(DateTime(), server_default=func.now())


class GestureCard(Base):
    __tablename__ = 'gesture_cards'

    card_id = Column(Integer, primary_key=True, autoincrement=True)
    lesson_id = Column(Integer, ForeignKey('lessons.lesson_id'), nullable=False)
    gesture_image_url = Column(String(255), nullable=False)
    gesture_name = Column(String(100), nullable=False)
    created_at = Column(DateTime(), server_default=func.now())

    lesson = relationship('Lesson', back_populates='gesture_cards')


class PracticeSession(Base):
    __tablename__ = 'practice_sessions'

    session_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.user_id'), nullable=False)
    lesson_id = Column(Integer, ForeignKey('lessons.lesson_id'), nullable=False)
    session_start = Column(DateTime(), server_default=func.now())
    session_end = Column(DateTime, nullable=True)
    result = Column(String(100), nullable=True)

    user = relationship('User', back_populates='sessions')
    lesson = relationship('Lesson', back_populates='sessions')


class GestureDetection(Base):
    __tablename__ = 'gesture_detections'

    detection_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey('practice_sessions.session_id'), nullable=False)
    gesture_card_id = Column(Integer, ForeignKey('gesture_cards.card_id'), nullable=False)
    detected_at = Column(DateTime(), server_default=func.now())
    detection_accuracy = Column(Float, nullable=False)

    session = relationship('PracticeSession', back_populates='detections')
    gesture_card = relationship('GestureCard', back_populates='detections')


Lesson.gesture_cards = relationship('GestureCard', order_by=GestureCard.card_id, back_populates='lesson')
User.sessions = relationship('PracticeSession', back_populates='user')
Lesson.sessions = relationship('PracticeSession', back_populates='lesson')
PracticeSession.detections = relationship('GestureDetection', back_populates='session')
GestureCard.detections = relationship('GestureDetection', back_populates='gesture_card')
