from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import base64
import time
import numpy as np
import cv2

from app.backend.ml.buffer import FrameBuffer
from app.backend.ml.model import GestureModel

router = APIRouter()

model = GestureModel("assets/gesture")


def decode_frame(data_url: str) -> np.ndarray:
    """
    data:image/jpeg;base64,... -> (3, 224, 224) float32
    """
    _, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)

    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)

    img = img.astype(np.float32) / 255.0
    img = img.transpose(2, 0, 1)  # (3, H, W)
    return img


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    buffer = FrameBuffer(window=32, frame_interval=2)

    infer_every_s = 0.25
    last_infer = 0.0

    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "frame":
                continue

            try:
                frame = await asyncio.to_thread(decode_frame, msg["data"])
            except Exception:
                continue

            buffer.add(frame)

            now = time.monotonic()
            if not buffer.is_ready:
                continue

            if (now - last_infer) < infer_every_s:
                continue

            last_infer = now

            window = buffer.get_window()

            result = await asyncio.to_thread(model.predict, window)

            await ws.send_json(result)

    except WebSocketDisconnect:
        return
