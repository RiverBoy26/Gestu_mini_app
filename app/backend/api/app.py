from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import lessons, categories, sessions, detections
from app.backend.api.ws import router as ws_router

app = FastAPI(title="Gestu API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router)
app.include_router(lessons.router)
app.include_router(sessions.router)
app.include_router(detections.router)
app.include_router(ws_router)