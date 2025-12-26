from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import base64
import time
from collections import deque
import numpy as np
import cv2
import os
import logging
import concurrent.futures

from app.backend.ml.easy_sign.detector import GestureDetectorSession

router = APIRouter()

DEBUG_WS = os.getenv("GESTU_WS_DEBUG", "0") == "1"
# 0 => пытаемся обрабатывать каждый кадр, который успеваем (без накопления очереди).
INFER_EVERY_MS = int(os.getenv("GESTU_WS_INFER_EVERY_MS", "0"))
MIN_CONF = float(os.getenv("GESTU_WS_MIN_CONF", "0.55"))

logger = logging.getLogger("gesture_ws")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def decode_frame_bgr224(data_url: str) -> np.ndarray:
    _, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("cv2.imdecode returned None")
    # на фронте уже 224x224, но оставим на всякий
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)
    return img


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    alive = True

    ping_interval_s = 10.0
    last_ping = 0.0

    # очередь строго на 1 элемент => "всегда последний кадр", без накапливания лага
    q: asyncio.Queue[str] = asyncio.Queue(maxsize=1)

    last_sent_word = ""
    last_sent_at = 0.0
    cooldown_s = 0.8

    # небольшая стабилизация "на уровне WS" (поверх smoother в детекторе)
    last_preds = deque(maxlen=3)

    frames_in = 0
    frames_dropped = 0
    decode_ok = 0
    decode_err = 0
    infer_n = 0
    last_debug = 0.0

    async def receiver():
        nonlocal alive, frames_in, frames_dropped
        try:
            while True:
                msg = await ws.receive_json()
                if msg.get("type") != "frame":
                    continue
                data = msg.get("data")
                if not isinstance(data, str):
                    continue
                frames_in += 1
                if q.full():
                    frames_dropped += 1
                    try:
                        q.get_nowait()
                    except Exception:
                        pass
                q.put_nowait(data)
        except WebSocketDisconnect:
            alive = False
            raise

    async def pinger():
        nonlocal last_ping, alive
        try:
            while alive:
                now = time.monotonic()
                if (now - last_ping) > ping_interval_s:
                    last_ping = now
                    try:
                        await ws.send_json({"type": "ping"})
                    except Exception:
                        alive = False
                        break
                await asyncio.sleep(0.25)
        except asyncio.CancelledError:
            return

    recv_task = None
    ping_task = None

    # inference в отдельном single-thread executor:
    # так детектор (landmarker) живёт и вызывается всегда из одного потока.
    loop = asyncio.get_running_loop()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    detector = None

    try:
        detector = await loop.run_in_executor(executor, GestureDetectorSession)

        recv_task = asyncio.create_task(receiver())
        ping_task = asyncio.create_task(pinger())

        last_infer = 0.0
        infer_every_s = max(0.0, INFER_EVERY_MS / 1000.0)

        while alive:
            try:
                data_url = await asyncio.wait_for(q.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            now = time.monotonic()

            if infer_every_s > 0 and (now - last_infer) < infer_every_s:
                continue
            last_infer = now

            try:
                frame = decode_frame_bgr224(data_url)
                decode_ok += 1
            except Exception:
                decode_err += 1
                continue

            # timestamp_ms для MediaPipe
            ts_ms = int(now * 1000)

            out = await loop.run_in_executor(executor, detector.process_frame_bgr, frame, ts_ms)
            infer_n += 1

            word = out.get("stable") or ""
            conf = float(out.get("confidence") or 0.0)
            raw = out.get("raw")

            if not word:
                continue
            if conf < MIN_CONF:
                continue

            last_preds.append(word)
            if len(last_preds) >= 3 and last_preds.count(word) < 2:
                continue

            if (now - last_sent_at) < cooldown_s and word == last_sent_word:
                continue

            last_sent_word = word
            last_sent_at = now

            payload = {"word": word, "confidence": conf, "raw": raw}
            try:
                await ws.send_json(payload)
            except WebSocketDisconnect:
                alive = False
                break

            if DEBUG_WS and (now - last_debug) > 1.0:
                last_debug = now
                logger.info(
                    f"frames_in={frames_in} dropped={frames_dropped} "
                    f"decode_ok={decode_ok} decode_err={decode_err} "
                    f"infer={infer_n} last={word}:{conf:.2f}"
                )

    except WebSocketDisconnect:
        pass
    finally:
        alive = False

        if recv_task is not None:
            recv_task.cancel()
        if ping_task is not None:
            ping_task.cancel()
        if recv_task is not None or ping_task is not None:
            try:
                await asyncio.gather(*(t for t in [recv_task, ping_task] if t is not None))
            except Exception:
                pass

        try:
            if detector is not None:
                await loop.run_in_executor(executor, detector.close)
        except Exception:
            pass
        executor.shutdown(wait=False)
