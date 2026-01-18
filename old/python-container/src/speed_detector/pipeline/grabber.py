"""Frame grabber for video sources (RTSP/HTTP/File).

このモジュールは動画ソースからフレームを取得する責務を担う。

設計判断:
- OpenCVを採用: 業界標準で多様な入力形式（mp4, avi, RTSP, HTTP）に対応
- FPSリミット機能: 30fps動画を全フレーム処理すると検出・OCRが追いつかないため、
  10fps程度に制限して処理負荷を軽減（標識は連続フレームで変わらないため問題なし）
- Frame dataclass: 生画像だけでなくタイムスタンプ・フレーム番号も保持し、
  後段処理やデバッグで「何フレーム目で検出したか」を追跡可能に
- Context Manager対応: cv2.VideoCaptureは明示的なreleaseが必要なため、
  with文でリソースリークを防止
"""

import time
import logging
from typing import Iterator, Optional
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from ..config import get_config, VideoConfig

logger = logging.getLogger(__name__)


@dataclass
class Frame:
    """A single video frame with metadata."""

    image: np.ndarray  # BGR image
    timestamp: float  # Frame timestamp in seconds
    frame_number: int

    @property
    def height(self) -> int:
        return self.image.shape[0]

    @property
    def width(self) -> int:
        return self.image.shape[1]


class FrameGrabber:
    """Grab frames from video sources (RTSP, HTTP, or file).

    Supports:
    - Local video files (mp4, avi, etc.)
    - RTSP streams (rtsp://...)
    - HTTP streams (http://..., https://...)
    """

    def __init__(self, video_url: Optional[str] = None, config: Optional[VideoConfig] = None):
        """Initialize the frame grabber.

        Args:
            video_url: URL or path to video source. If None, uses config.
            config: Video configuration. If None, uses global config.
        """
        self.config = config or get_config().video
        self.video_url = video_url or self.config.url

        if not self.video_url:
            raise ValueError("No video URL provided. Set VIDEO_URL environment variable or pass video_url.")

        self._cap: Optional[cv2.VideoCapture] = None
        self._frame_number = 0
        self._last_frame_time = 0.0
        self._min_frame_interval = 1.0 / self.config.fps_limit if self.config.fps_limit > 0 else 0

    def _is_file(self) -> bool:
        """Check if the video source is a local file."""
        if self.video_url.startswith(("rtsp://", "http://", "https://")):
            return False
        return Path(self.video_url).exists()

    def open(self) -> bool:
        """Open the video source.

        Returns:
            True if successfully opened, False otherwise.
        """
        if self._cap is not None:
            self._cap.release()

        self._cap = cv2.VideoCapture(self.video_url)

        if not self._cap.isOpened():
            logger.error(f"Failed to open video source: {self.video_url}")
            return False

        self._frame_number = 0
        logger.info(f"Opened video source: {self.video_url}")
        logger.info(f"Video properties: {self.get_video_info()}")
        return True

    def close(self) -> None:
        """Close the video source."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None
            logger.info("Closed video source")

    def get_video_info(self) -> dict:
        """Get video source information."""
        if self._cap is None:
            return {}

        return {
            "width": int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": self._cap.get(cv2.CAP_PROP_FPS),
            "frame_count": int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            "is_file": self._is_file(),
        }

    def read_frame(self) -> Optional[Frame]:
        """Read a single frame from the video source.

        Returns:
            Frame if successful, None if end of video or error.
        """
        if self._cap is None or not self._cap.isOpened():
            return None

        # Rate limiting
        if self._min_frame_interval > 0:
            elapsed = time.time() - self._last_frame_time
            if elapsed < self._min_frame_interval:
                time.sleep(self._min_frame_interval - elapsed)

        ret, frame = self._cap.read()

        if not ret:
            if self._is_file():
                logger.info("End of video file reached")
            else:
                logger.warning("Failed to read frame from stream")
            return None

        self._last_frame_time = time.time()
        timestamp = self._cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        self._frame_number += 1

        return Frame(
            image=frame,
            timestamp=timestamp,
            frame_number=self._frame_number,
        )

    def frames(self, loop: bool = False) -> Iterator[Frame]:
        """Iterate over frames from the video source.

        Args:
            loop: If True and source is a file, loop back to start when finished.

        Yields:
            Frame objects.
        """
        if not self.open():
            return

        while True:
            frame = self.read_frame()

            if frame is None:
                if loop and self._is_file():
                    logger.info("Looping video file")
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self._frame_number = 0
                    continue
                else:
                    break

            yield frame

        self.close()

    def __enter__(self) -> "FrameGrabber":
        """Context manager entry."""
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        self.close()

    def __iter__(self) -> Iterator[Frame]:
        """Iterate over frames."""
        return self.frames()
