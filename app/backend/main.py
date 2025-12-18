import os
from dotenv import load_dotenv
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from bot.handlers import start
from db import engine, Base


async def main():
    load_dotenv()
    Base.metadata.create_all(engine)
    bot = Bot(token=os.getenv('TOKEN'))
    dp = Dispatcher()
    dp.message.register(start, CommandStart())
    await dp.start_polling(bot)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Exit")
