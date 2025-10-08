import os
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
import db.requests as rq


WEBAPP_URL = os.getenv("WEBAPP_URL", "https://gestu.ru")


async def start(message: Message):
    user = message.from_user

    # await rq.add_user(user.id, user.username)

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Открыть Web App", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer("Web App:", reply_markup=kb)
