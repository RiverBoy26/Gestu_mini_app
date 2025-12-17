from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import base64
import numpy as np
import cv2

from app.backend.ml.buffer import FrameBuffer
from app.backend.ml.model import GestureModel

router = APIRouter()

model = GestureModel("assets/gesture")


def decode_frame(data_url: str) -> np.ndarray:
    """
    data:image/jpeg;base64,...
    -> np.ndarray (3, H, W), float32
    """
    header, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)

    img = cv2.imdecode(
        np.frombuffer(img_bytes, np.uint8),
        cv2.IMREAD_COLOR
    )

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224))

    img = img.astype(np.float32) / 255.0
    img = img.transpose(2, 0, 1)  # (3, H, W)

    return img


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    buffer = FrameBuffer(window=32, frame_interval=2)

    try:
        while True:
            msg = await ws.receive_json()

            if msg.get("type") != "frame":
                continue

            frame = decode_frame(msg["data"])
            buffer.add(frame)

            if buffer.is_ready:
                window = buffer.get_window()
                result = model.predict(window)

                await ws.send_json(result)

    except WebSocketDisconnect:
        pass
