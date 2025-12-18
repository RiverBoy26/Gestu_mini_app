from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from ..deps import get_db, get_current_user
from app.backend.db.models import PracticeSession
from app.backend.api.schemas import SessionStartIn, SessionStartOut, SessionFinishIn


router = APIRouter(prefix="/api/v1", tags=["sessions"])


@router.post("/sessions", response_model=SessionStartOut)
def start_session(payload: SessionStartIn, db: Session = Depends(get_db), user = Depends(get_current_user)):
    s = PracticeSession(user_id=user.user_id, lesson_id=payload.lesson_id)
    db.add(s); db.commit(); db.refresh(s)
    return {"session_id": s.session_id, "session_start": s.session_start}


@router.patch("/sessions/{session_id}")
def finish_session(session_id: int, payload: SessionFinishIn, db: Session = Depends(get_db), user = Depends(get_current_user)):
    s = db.query(PracticeSession).filter_by(session_id=session_id, user_id=user.user_id).first()
    if not s:
        raise HTTPException(404, "Session not found")
    s.result = payload.result
    s.session_end = payload.session_end or datetime.utcnow()
    db.commit()
    return {"ok": True}
