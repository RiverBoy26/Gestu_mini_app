from collections import deque
import numpy as np


class FrameBuffer:
    def __init__(self, window: int, frame_interval: int = 1):
        self.window = window
        self.frame_interval = frame_interval

        self._frames = deque(maxlen=window)
        self._counter = 0

    def reset(self):
        self._frames.clear()
        self._counter = 0

    def add(self, frame: np.ndarray):
        """
        frame: np.ndarray of shape (3, H, W)
        """
        self._counter += 1

        if self._counter % self.frame_interval != 0:
            return

        self._frames.append(frame)

    @property
    def is_ready(self) -> bool:
        return len(self._frames) == self.window

    def get_window(self) -> np.ndarray:
        """
        Returns tensor of shape:
        (1, 1, 3, T, H, W)
        """
        if not self.is_ready:
            raise RuntimeError("FrameBuffer is not ready")

        # (T, 3, H, W)
        data = np.stack(self._frames, axis=0)

        # -> (1, 1, 3, T, H, W)
        data = data.transpose(1, 0, 2, 3)   # (3, T, H, W)
        data = data[np.newaxis, np.newaxis]

        return data.astype(np.float32)
