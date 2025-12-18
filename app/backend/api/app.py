from fastapi import FastAPI
from api.routes import lessons, sessions, detections
from app.backend.api.ws import router as ws_router

app = FastAPI(title="Gestu API")
app.include_router(lessons.router)
app.include_router(sessions.router)
app.include_router(detections.router)
app.include_router(ws_router)