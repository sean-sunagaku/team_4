"""Pipeline process module for Phase 2 multiprocessing support.

This module provides the infrastructure to run the video pipeline
in a separate process for better performance (GIL avoidance).
"""

import logging
import multiprocessing as mp
from typing import Optional

from ..config import get_config
from .grabber import FrameGrabber
from .detector import SpeedSignDetector
from .ocr import SpeedOCR
from .state_manager import StateManager, create_detection

logger = logging.getLogger(__name__)


def pipeline_process(
    video_url: str,
    shutdown_event: mp.Event,
    state_queue: Optional[mp.Queue] = None,
) -> None:
    """Run the video processing pipeline in a separate process.

    This is designed for Phase 2 when multiprocessing is implemented.

    Args:
        video_url: Video source URL/path.
        shutdown_event: Event to signal shutdown.
        state_queue: Queue to send state updates (optional).
    """
    try:
        logger.info("Pipeline process starting...")

        # Initialize components
        grabber = FrameGrabber(video_url=video_url)
        detector = SpeedSignDetector()
        ocr = SpeedOCR()
        state_manager = StateManager()

        logger.info(f"Processing video: {video_url}")

        for frame in grabber.frames(loop=True):
            if shutdown_event.is_set():
                break

            try:
                # Detect speed signs
                detections = detector.detect(frame.image)

                if not detections:
                    detections = detector.detect_circular_signs(frame.image)

                if detections:
                    best_detection = max(detections, key=lambda d: d.confidence)
                    ocr_result = ocr.read_with_preprocessing(best_detection.cropped_image)

                    if ocr_result:
                        detection = create_detection(
                            speed_limit=ocr_result.speed_limit,
                            confidence=ocr_result.confidence,
                            bbox=best_detection.bbox,
                            time_condition=ocr_result.time_condition,
                        )
                        state = state_manager.update(detection)
                    else:
                        state = state_manager.update(None)
                else:
                    state = state_manager.update(None)

                # Send state to queue if provided
                if state_queue is not None:
                    try:
                        state_queue.put_nowait(state.to_dict())
                    except Exception:
                        pass  # Queue full, skip

            except Exception as e:
                logger.error(f"Error processing frame: {e}")

    except Exception as e:
        logger.error(f"Pipeline process error: {e}")
    finally:
        logger.info("Pipeline process stopped")


class PipelineManager:
    """Manager for the video processing pipeline process.

    This class handles starting, stopping, and monitoring the
    pipeline process for Phase 2 multiprocessing.
    """

    def __init__(self, video_url: str):
        """Initialize the pipeline manager.

        Args:
            video_url: Video source URL/path.
        """
        self.video_url = video_url
        self._process: Optional[mp.Process] = None
        self._shutdown_event = mp.Event()
        self._state_queue = mp.Queue(maxsize=10)

    def start(self) -> None:
        """Start the pipeline process."""
        if self._process is not None and self._process.is_alive():
            logger.warning("Pipeline already running")
            return

        self._shutdown_event.clear()
        self._process = mp.Process(
            target=pipeline_process,
            args=(self.video_url, self._shutdown_event, self._state_queue),
        )
        self._process.start()
        logger.info(f"Pipeline process started (PID: {self._process.pid})")

    def stop(self, timeout: float = 5.0) -> None:
        """Stop the pipeline process.

        Args:
            timeout: Seconds to wait for graceful shutdown.
        """
        if self._process is None:
            return

        self._shutdown_event.set()
        self._process.join(timeout)

        if self._process.is_alive():
            logger.warning("Force terminating pipeline process")
            self._process.terminate()
            self._process.join(1.0)

        self._process = None
        logger.info("Pipeline process stopped")

    def is_running(self) -> bool:
        """Check if the pipeline process is running."""
        return self._process is not None and self._process.is_alive()

    def get_latest_state(self) -> Optional[dict]:
        """Get the latest state from the pipeline.

        Returns:
            Latest state dict or None if queue is empty.
        """
        state = None
        while not self._state_queue.empty():
            try:
                state = self._state_queue.get_nowait()
            except Exception:
                break
        return state
