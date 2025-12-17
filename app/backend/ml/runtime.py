import yaml
import onnxruntime as ort
from pathlib import Path
import numpy as np


class GestureRuntime:
    def __init__(self, asset_dir: str):
        base_dir = Path(__file__).resolve().parent
        self.asset_dir = base_dir / asset_dir

        self.config = self._load_config()
        self.session = self._load_model()
        self.input_name = self.session.get_inputs()[0].name

        self._warmup()

    def _load_config(self) -> dict:
        config_path = self.asset_dir / "config.yml"
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _load_model(self):
        model_path = self.asset_dir / self.config["model"]["weights"]

        providers = ["CPUExecutionProvider"]
        if self.config.get("device") == "cuda":
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

        return ort.InferenceSession(
            str(model_path),
            providers=providers
        )

    def _warmup(self):
        window = self.config["stream"]["window"]
        h, w = self.config["model"]["input_size"]

        dummy = np.zeros((1, 1, 3, window, h, w), dtype=np.float32)
        self.session.run(None, {self.input_name: dummy})

    def infer(self, window: np.ndarray):
        return self.session.run(None, {self.input_name: window})
