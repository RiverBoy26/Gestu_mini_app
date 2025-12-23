import os
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
import db.requests as rq


WEBAPP_URL = os.getenv("WEBAPP_URL", "https://gestu.ru")


async def start(message: Message):
    user = message.from_user

    rq.add_user(user.id, user.username)

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Открыть Web App", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer(f"Привет!👋\nДобро пожаловать в мир новых знаний, где ты сможешь стать одним из тех людей, кто говорит руками и слушает глазами!\nГотов взглянуть на этот мир под новым углом?👀", reply_markup=kb)

