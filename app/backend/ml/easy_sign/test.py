import json
import time
import numpy as np
from pathlib import Path

from runtime import Predictor


def main():
    BASE_DIR = Path(__file__).resolve().parent
    config_path = BASE_DIR / "config.json"

    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["threshold"] = 0.0
    cfg["topk"] = 5
    cfg["provider"] = "CPUExecutionProvider"

    print("Config:", cfg)

    model = Predictor(cfg)

    T = int(cfg["window_size"])
    frames = [np.zeros((224, 224, 3), dtype=np.uint8) for _ in range(T)]

    t0 = time.perf_counter()
    out = model.predict(frames)
    dt = (time.perf_counter() - t0) * 1000.0

    print(f"Infer ms: {dt:.1f}")
    print("Output:", out)

    assert out is not None, "predict вернул None"
    assert "labels" in out and "confidence" in out

    print("OK: model loads + runs.")


if __name__ == "__main__":
    main()
