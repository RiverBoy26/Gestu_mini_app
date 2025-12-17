from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import base64
import time
import numpy as np
import cv2
import os
import logging
from collections import deque, Counter

from app.backend.ml.buffer import FrameBuffer
from app.backend.ml.model import GestureModel

router = APIRouter()
model = GestureModel("assets/gesture")

# DEBUG switch
DEBUG_WS = os.getenv("GESTU_WS_DEBUG", "0") == "1"

logger = logging.getLogger("gesture_ws")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ImageNet normalization
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)[:, None, None]
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)[:, None, None]


def softmax(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x, axis=1, keepdims=True)
    exp = np.exp(x)
    return exp / np.sum(exp, axis=1, keepdims=True)


def topk_from_window(window: np.ndarray, k: int = 5):
    """
    Debug helper: получить top-k прямо из runtime.
    Возвращает список [(label, prob), ...]
    """
    logits = model.runtime.infer(window)[0]  # ожидаемо shape (1, N)
    probs = softmax(logits)
    idxs = np.argsort(probs[0])[::-1][:k]
    out = []
    for i in idxs:
        label = model.labels[int(i)] if int(i) < len(model.labels) else f"idx_{int(i)}"
        out.append((label, float(probs[0, int(i)])))
    return out


def decode_frame(data_url: str) -> np.ndarray:
    header, encoded = data_url.split(",", 1)
    img_bytes = base64.b64decode(encoded)

    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("bad image")

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (224, 224), interpolation=cv2.INTER_LINEAR)

    img = img.astype(np.float32) / 255.0
    img = img.transpose(2, 0, 1)  # (3, H, W)
    img = (img - IMAGENET_MEAN) / IMAGENET_STD
    return img


class MajorityVoteSmoother:
    def __init__(self, size=7, min_ratio=0.6, min_samples=5):
        self.buf = deque(maxlen=size)
        self.min_ratio = min_ratio
        self.min_samples = min_samples

    def add(self, word: str, conf: float):
        self.buf.append((word or "", float(conf or 0.0)))

    def stable(self):
        valid = [(w, c) for (w, c) in self.buf if w]
        if len(valid) < self.min_samples:
            return None
        counts = Counter(w for w, _ in valid)
        word, cnt = counts.most_common(1)[0]
        ratio = cnt / len(valid)
        if ratio < self.min_ratio:
            return None
        confs = [c for w, c in valid if w == word]
        return word, float(sum(confs) / len(confs)), float(ratio)


@router.websocket("/ws/gesture")
async def gesture_ws(ws: WebSocket):
    await ws.accept()

    buffer = FrameBuffer(window=32, frame_interval=2)

    infer_every_s = 0.25
    last_infer = 0.0

    ping_interval_s = 10.0
    last_ping = 0.0

    q: asyncio.Queue[str] = asyncio.Queue(maxsize=1)

    smoother = MajorityVoteSmoother(size=7, min_ratio=0.6, min_samples=5)
    last_sent_word = None

    # debug stats
    conn_id = f"{int(time.time()*1000)%100000}-{id(ws)%10000}"
    frames_in = 0
    frames_dropped = 0
    decode_ok = 0
    decode_err = 0
    infer_n = 0
    last_debug = 0.0
    debug_every_s = 1.0

    if DEBUG_WS:
        logger.info(f"[{conn_id}] WS accepted. labels={len(model.labels)} window={buffer.window} interval={buffer.frame_interval}")

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
                if DEBUG_WS:
                    now = time.monotonic()
                    if now - last_debug >= debug_every_s:
                        last_debug = now
                        logger.info(f"[{conn_id}] timeout waiting frame (no incoming?)")
                continue

            t0 = time.perf_counter()
            try:
                frame = await asyncio.to_thread(decode_frame, data_url)
                decode_ok += 1
            except Exception:
                decode_err += 1
                continue
            decode_ms = (time.perf_counter() - t0) * 1000.0

            buffer.add(frame)

            now = time.monotonic()

            if DEBUG_WS and (now - last_debug) >= debug_every_s:
                last_debug = now
                buf_len = len(buffer._frames)
                fm, fM, fmean = float(frame.min()), float(frame.max()), float(frame.mean())
                logger.info(
                    f"[{conn_id}] frames_in={frames_in} dropped={frames_dropped} "
                    f"decode_ok={decode_ok} decode_err={decode_err} "
                    f"buf={buf_len}/{buffer.window} ready={buffer.is_ready} "
                    f"decode_ms={decode_ms:.1f} frame(min/mean/max)={fm:.3f}/{fmean:.3f}/{fM:.3f}"
                )

            if not buffer.is_ready:
                continue
            if (now - last_infer) < infer_every_s:
                continue

            last_infer = now
            window = buffer.get_window()

            t1 = time.perf_counter()
            raw = await asyncio.to_thread(model.predict, window)
            infer_ms = (time.perf_counter() - t1) * 1000.0
            infer_n += 1

            word = raw.get("word", "")
            conf = raw.get("confidence", 0.0)
            if word == "unknown":
                word = ""

            if DEBUG_WS:
                try:
                    top5 = await asyncio.to_thread(topk_from_window, window, 5)
                    top5_str = " | ".join([f"{w}:{p*100:.1f}%" for (w, p) in top5])
                except Exception:
                    top5_str = "top5_error"
                logger.info(f"[{conn_id}] infer#{infer_n} infer_ms={infer_ms:.1f} raw={word or '(empty)'}:{conf*100:.1f}% top5={top5_str}")

            smoother.add(word, conf)
            stable = smoother.stable()
            if stable is None:
                continue

            stable_word, stable_conf, vote_ratio = stable
            if stable_word != last_sent_word:
                last_sent_word = stable_word
                await ws.send_json({
                    "word": stable_word,
                    "confidence": stable_conf,
                    "vote_ratio": vote_ratio
                })

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