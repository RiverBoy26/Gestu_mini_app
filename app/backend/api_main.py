from fastapi import FastAPI
from app.backend.api.ws import router as ws_router

app = FastAPI()
app.include_router(ws_router)
