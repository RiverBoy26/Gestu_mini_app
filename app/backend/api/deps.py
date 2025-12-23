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
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token not configured (env TOKEN)")

    parsed = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))

    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash")

    parsed.pop("signature", None)

    data_check_string = "\n".join(f"{k}={parsed[k]}" for k in sorted(parsed.keys()))
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()

    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
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
    print("TOKEN present:", bool(os.getenv("TOKEN")))
    print("TOKEN head:", (os.getenv("TOKEN","")[:10] + "...") if os.getenv("TOKEN") else "NONE")
    print("initData head:", x_init_data[:60])
    return user
