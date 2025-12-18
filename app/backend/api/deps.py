from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from ..db import get_session
from ..db.models import User
import hmac, hashlib, urllib.parse, json, os


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _check_telegram_init_data(init_data_raw: str, bot_token: str) -> dict:
    parsed = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))
    if 'hash' not in parsed:
        raise HTTPException(status_code=401, detail="Missing hash")
    received_hash = parsed.pop('hash')

    data_check_string = "\n".join(f"{k}={parsed[k]}" for k in sorted(parsed.keys()))
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    h = hmac.new(secret_key, msg=data_check_string.encode(), digestmod=hashlib.sha256).hexdigest()
    if not hmac.compare_digest(h, received_hash):
        raise HTTPException(status_code=401, detail="Bad signature")

    user_json = parsed.get("user")
    if not user_json:
        raise HTTPException(status_code=401, detail="No user")
    return json.loads(user_json)


def get_current_user(
    x_init_data: str | None = Header(default=None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(get_db),
):
    if not x_init_data:
        raise HTTPException(status_code=401, detail="No init data")
    user_dict = _check_telegram_init_data(x_init_data, os.getenv("TOKEN", ""))
    tg_id = user_dict["id"]
    username = user_dict.get("username")

    user = db.query(User).filter_by(telegram_id=tg_id).first()
    if not user:
        user = User(telegram_id=tg_id, username=username)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
