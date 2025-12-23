from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from ..db import get_session
from ..db.models import User
import os

from aiogram.utils.web_app import safe_parse_webapp_init_data


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    x_init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
):
    if not x_init_data:
        raise HTTPException(status_code=401, detail="No init data")

    token = (os.getenv("TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=500, detail="Bot token not configured (env TOKEN)")

    init_data = x_init_data.strip().strip('"')

    try:
        data = safe_parse_webapp_init_data(token=token, init_data=init_data)
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad signature")

    tg_id = data.user.id
    username = data.user.username or data.user.first_name or "user"

    user = db.query(User).filter_by(telegram_id=tg_id).first()
    if not user:
        user = User(telegram_id=tg_id, username=username)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
