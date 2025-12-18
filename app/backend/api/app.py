from fastapi import FastAPI
from api.routes import lessons, sessions, detections


app = FastAPI(title="Gestu API")
app.include_router(lessons.router)
app.include_router(sessions.router)
app.include_router(detections.router)
