from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import base64
import json
import time
from pathlib import Path
from collections import deque
import numpy as np
import cv2
import os
import logging

from app.backend.ml.easy_sign.runtime import Predictor

router = APIRouter()

DEBUG_WS = os.getenv("GESTU_WS_DEBUG", "0") == "1"
logger = logging.getLogger("gesture_ws")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


BACKEND_DIR = Path(__file__).resolve().parent.parent
CFG_PATH = BACKEND_DIR / "ml" / "easy_sign" / "config.json"

with open(CFG_PATH, "r", encoding="utf-8") as f:
    CFG = json.load(f)

CFG.setdefault("provider", "CPUExecutionProvider")

predictor = Predictor(CFG)

WINDOW_SIZE = int(CFG.get("window_size", 32))


def decode_frame_bgr224(data_url: str) -> np.ndarray:
    _, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)

    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("bad image")

    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)
    return img 


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    conn_id = f"{int(time.time()*1000)%100000}-{id(ws)%10000}"

    infer_every_s = 0.35
    last_infer = 0.0

    ping_interval_s = 10.0
    last_ping = 0.0

    q: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    frames = deque(maxlen=WINDOW_SIZE)

    last_sent_word = ""
    last_sent_at = 0.0
    cooldown_s = 0.8

    frames_in = 0
    frames_dropped = 0
    decode_ok = 0
    decode_err = 0
    infer_n = 0
    last_debug = 0.0

    if DEBUG_WS:
        logger.info(f"[{conn_id}] WS accepted. window_size={WINDOW_SIZE} provider={CFG.get('provider')}")

    async def receiver():
        nonlocal frames_in, frames_dropped
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
                if DEBUG_WS and (time.monotonic() - last_debug) > 1.0:
                    last_debug = time.monotonic()
                    logger.info(f"[{conn_id}] timeout waiting frame")
                continue

            try:
                t0 = time.perf_counter()
                frame = await asyncio.to_thread(decode_frame_bgr224, data_url)
                decode_ok += 1
                decode_ms = (time.perf_counter() - t0) * 1000.0
            except Exception:
                decode_err += 1
                continue

            frames.append(frame)

            now = time.monotonic()

            if DEBUG_WS and (now - last_debug) > 1.0:
                last_debug = now
                logger.info(
                    f"[{conn_id}] frames_in={frames_in} dropped={frames_dropped} "
                    f"decode_ok={decode_ok} decode_err={decode_err} "
                    f"buf={len(frames)}/{WINDOW_SIZE} decode_ms={decode_ms:.1f}"
                )

            if len(frames) < WINDOW_SIZE:
                continue
            if (now - last_infer) < infer_every_s:
                continue

            last_infer = now

            t1 = time.perf_counter()
            pred = await asyncio.to_thread(predictor.predict, list(frames))
            infer_ms = (time.perf_counter() - t1) * 1000.0
            infer_n += 1

            if not pred:
                continue

            word = pred["labels"].get(0, "") if isinstance(pred.get("labels"), dict) else ""
            conf = float(pred["confidence"].get(0, 0.0)) if isinstance(pred.get("confidence"), dict) else 0.0

            if word in {"", "no", "---"}:
                continue

            if (now - last_sent_at) < cooldown_s and word == last_sent_word:
                continue

            last_sent_word = word
            last_sent_at = now

            if DEBUG_WS:
                logger.info(f"[{conn_id}] infer#{infer_n} infer_ms={infer_ms:.1f} word={word} conf={conf:.4f}")

            await ws.send_json({"word": word, "confidence": conf})

            frames.clear()

    except WebSocketDisconnect as e:
        if DEBUG_WS:
            logger.info(f"[{conn_id}] WS disconnect code={getattr(e, 'code', None)}")
    finally:
        recv_task.cancel()
        ping_task.cancel()
        try:
            await asyncio.gather(recv_task, ping_task)
        except Exception:
            pass
