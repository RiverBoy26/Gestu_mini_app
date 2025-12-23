from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from ..db import get_session
from ..db.models import User
import hmac, hashlib, urllib.parse, json, os


TELEGRAM_DEBUG = os.getenv("TELEGRAM_DEBUG", "0") == "1"


def get_db():
    db = get_session()
    try:
        yield db
    finally:
        db.close()


def _check_telegram_init_data(init_data_raw: str, bot_token: str) -> dict:
    bot_token = (bot_token or "").strip()
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token not configured (env TOKEN)")

    parsed = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash")

    parsed.pop("signature", None)

    data_check_string = "\n".join(f"{k}={parsed[k]}" for k in sorted(parsed.keys()))
    msg = data_check_string.encode("utf-8")

    # Вариант A (по доке): key="WebAppData", msg=bot_token
    secret_a = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    computed_a = hmac.new(secret_a, msg, hashlib.sha256).hexdigest()

    # Вариант B (на случай, если где-то перепутали порядок)
    secret_b = hmac.new(
        key=bot_token.encode("utf-8"),
        msg=b"WebAppData",
        digestmod=hashlib.sha256,
    ).digest()
    computed_b = hmac.new(secret_b, msg, hashlib.sha256).hexdigest()

    if not (hmac.compare_digest(computed_a, received_hash) or hmac.compare_digest(computed_b, received_hash)):
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
    username = user_dict.get("username") or user_dict.get("first_name") or "user"

    user = db.query(User).filter_by(telegram_id=tg_id).first()
    if not user:
        user = User(telegram_id=tg_id, username=username)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
