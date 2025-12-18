from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from ..deps import get_db, get_current_user
from db.models import GestureDetection
from app.backend.api.schemas import DetectionsBulkIn


router = APIRouter(prefix="/api/v1", tags=["detections"])


@router.post("/detections/bulk")
def post_detections(payload: DetectionsBulkIn, db: Session = Depends(get_db), user = Depends(get_current_user)):
    for d in payload.items:
        det = GestureDetection(
            session_id=d.session_id,
            gesture_card_id=d.gesture_card_id,
            detection_accuracy=d.detection_accuracy,
            detected_at=d.detected_at or datetime.utcnow()
        )
        db.add(det)
    db.commit()
    return {"inserted": len(payload.items)}
