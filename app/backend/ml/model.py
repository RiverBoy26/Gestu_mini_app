import numpy as np
from pathlib import Path
from .runtime import GestureRuntime


class GestureModel:
    def __init__(self, asset_dir: str):
        self.runtime = GestureRuntime(asset_dir)
        self.labels = self._load_labels()

    def _load_labels(self):
        labels_path = Path(self.runtime.asset_dir) / "labels.txt"

        if not labels_path.exists():
            raise FileNotFoundError(
                "labels.txt not found in assets/gesture"
            )

        with open(labels_path, "r", encoding="utf-8") as f:
            return [line.strip() for line in f]

    def predict(self, window: np.ndarray):
        logits = self.runtime.infer(window)[0]  # (1, 1001)

        probs = self._softmax(logits)
        idx = int(np.argmax(probs))
        confidence = float(probs[0, idx])

        word = self.labels[idx] if idx < len(self.labels) else "unknown"

        return {
            "word": word,
            "confidence": confidence
        }

    @staticmethod
    def _softmax(x):
        x = x - np.max(x, axis=1, keepdims=True)
        exp = np.exp(x)
        return exp / np.sum(exp, axis=1, keepdims=True)
