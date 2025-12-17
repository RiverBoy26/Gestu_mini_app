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
    header, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)

    img = cv2.imdecode(
        np.frombuffer(img_bytes, np.uint8),
        cv2.IMREAD_COLOR
    )
    if img is None:
        raise ValueError("bad image")

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)

    img = img.astype(np.float32) / 255.0
    img = img.transpose(2, 0, 1)
    return img


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    buffer = FrameBuffer(window=32, frame_interval=2)

    infer_every_s = 0.25
    last_infer = 0.0

    ping_interval_s = 10.0
    last_ping = 0.0

    q: asyncio.Queue[str] = asyncio.Queue(maxsize=1)

    async def receiver():
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "frame":
                continue
            data = msg.get("data")
            if not isinstance(data, str):
                continue
            if q.full():
                try:
                    q.get_nowait()
                except Exception:
                    pass
            try:
                q.put_nowait(data)
            except Exception:
                pass

    async def pinger():
        nonlocal last_ping
        while True:
            await asyncio.sleep(1.0)
            now = time.monotonic()
            if (now - last_ping) >= ping_interval_s:
                last_ping = now
                await ws.send_json({"type": "ping", "ts": time.time()})

    recv_task = asyncio.create_task(receiver())
    ping_task = asyncio.create_task(pinger())

    try:
        while True:
            try:
                data_url = await asyncio.wait_for(q.get(), timeout=2.0)
            except asyncio.TimeoutError:
                continue

            try:
                frame = await asyncio.to_thread(decode_frame, data_url)
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

    except WebSocketDisconnect as e:
        print("WS disconnect", getattr(e, "code", None))
    finally:
        recv_task.cancel()
        ping_task.cancel()
        try:
            await asyncio.gather(recv_task, ping_task)
        except Exception:
            pass