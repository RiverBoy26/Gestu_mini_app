from pathlib import Path
from sys import platform
import numpy as np
import onnxruntime as rt
from einops import rearrange


class Predictor:
    def __init__(self, model_config: dict):
        self.config = model_config
        self.provider = self.config.get("provider", "CPUExecutionProvider")
        self.threshold = float(self.config.get("threshold", 0.5))
        self.topk = int(self.config.get("topk", 1))
        self.labels = {}

        self._init_model()
        self._load_labels()

    def _init_model(self):
        base_dir = Path(__file__).resolve().parent
        model_path = base_dir / self.config["path_to_model"]

        providers = [self.provider]

        if self.provider == "OpenVINOExecutionProvider":
            if platform in {"win32", "win64"}:
                import onnxruntime.tools.add_openvino_win_libs as ov_utils
                ov_utils.add_openvino_libs_to_path()

        self.session = rt.InferenceSession(
            str(model_path),
            providers=providers
        )

        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def _load_labels(self):
        base_dir = Path(__file__).resolve().parent
        labels_path = base_dir / self.config["path_to_class_list"]

        with open(labels_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]

        pairs = [line.split("\t", 1) for line in lines]
        self.labels = {int(idx): lbl for idx, lbl in pairs}

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        x = x - np.max(x, axis=1, keepdims=True)
        exp = np.exp(x)
        return exp / np.sum(exp, axis=1, keepdims=True)

    def predict(self, frames: list[np.ndarray]):
        if len(frames) == 0:
            return None

        clip = np.asarray(frames, dtype=np.float32) / 255.0
        clip = rearrange(clip, "t h w c -> 1 c t h w")

        logits = self.session.run(
            [self.output_name],
            {self.input_name: clip}
        )[0]

        probs = self._softmax(logits)
        probs = np.squeeze(probs, axis=0)

        topk_idx = np.argsort(probs)[-self.topk:][::-1]
        topk_conf = probs[topk_idx]

        if float(np.max(topk_conf)) < self.threshold:
            return None

        result_labels = {
            i: self.labels[int(idx)]
            for i, idx in enumerate(topk_idx)
        }
        result_conf = {
            i: float(topk_conf[i])
            for i in range(len(topk_conf))
        }

        return {
            "labels": result_labels,
            "confidence": result_conf,
        }
