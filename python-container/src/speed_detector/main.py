"""Main entry point for the speed limit detector.

This module orchestrates:
1. Video pipeline (frame grabbing, detection, OCR, state management)
2. API server (FastAPI with REST and WebSocket endpoints)

For MVP, runs in a single process with threading.
For Phase 2, will use multiprocessing for better performance.
"""

import logging
import threading
import signal
import sys
from typing import Optional

import uvicorn

from .config import get_config
from .pipeline.grabber import FrameGrabber
from .pipeline.detector import SpeedSignDetector
from .pipeline.ocr import SpeedOCR
from .pipeline.state_manager import StateManager, create_detection
from .shared.memory import get_shared_memory
from .api.server import app, set_pipeline_running

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global flag for graceful shutdown
_shutdown_event = threading.Event()


def run_pipeline(video_url: Optional[str] = None) -> None:
    """Run the video processing pipeline.

    This function:
    1. Grabs frames from the video source
    2. Detects speed signs using YOLO
    3. Reads speed values using OCR
    4. Updates state with 3-frame confirmation

    Args:
        video_url: Video source URL/path. If None, uses config.
    """
    config = get_config()

    try:
        logger.info("Initializing pipeline components...")

        # Initialize components
        grabber = FrameGrabber(video_url=video_url)
        detector = SpeedSignDetector()
        ocr = SpeedOCR()
        state_manager = StateManager()

        set_pipeline_running(True)
        logger.info(f"Starting pipeline for video: {grabber.video_url}")

        # Process frames
        for frame in grabber.frames(loop=True):
            if _shutdown_event.is_set():
                logger.info("Shutdown requested, stopping pipeline")
                break

            try:
                # Detect speed signs
                detections = detector.detect(frame.image)

                # If no YOLO detections, try circular sign detection as fallback
                if not detections:
                    detections = detector.detect_circular_signs(frame.image)

                # Process detections
                if detections:
                    # Use the most confident detection
                    best_detection = max(detections, key=lambda d: d.confidence)

                    # Read speed value with OCR
                    ocr_result = ocr.read_with_preprocessing(best_detection.cropped_image)

                    if ocr_result:
                        # Create detection and update state
                        detection = create_detection(
                            speed_limit=ocr_result.speed_limit,
                            confidence=ocr_result.confidence,
                            bbox=best_detection.bbox,
                            time_condition=ocr_result.time_condition,
                        )
                        state_manager.update(detection)
                    else:
                        # No valid OCR result
                        state_manager.update(None)
                else:
                    # No sign detected
                    state_manager.update(None)

            except Exception as e:
                logger.error(f"Error processing frame {frame.frame_number}: {e}")
                continue

    except Exception as e:
        logger.error(f"Pipeline error: {e}")
    finally:
        set_pipeline_running(False)
        logger.info("Pipeline stopped")


def run_api_server() -> None:
    """Run the FastAPI server."""
    config = get_config()

    logger.info(f"Starting API server on {config.api.host}:{config.api.port}")

    uvicorn.run(
        app,
        host=config.api.host,
        port=config.api.port,
        log_level="info",
    )


def main(video_url: Optional[str] = None, api_only: bool = False) -> None:
    """Main entry point.

    Args:
        video_url: Video source URL/path. If None, uses environment variable.
        api_only: If True, only run the API server without the pipeline.
    """
    # Setup signal handlers
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal")
        _shutdown_event.set()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    if api_only:
        # Just run the API server
        run_api_server()
    else:
        # Run both pipeline and API server
        config = get_config()
        video_url = video_url or config.video.url

        if not video_url:
            logger.error(
                "No video URL provided. Set VIDEO_URL environment variable "
                "or pass video_url argument."
            )
            sys.exit(1)

        # Start pipeline in a separate thread
        pipeline_thread = threading.Thread(
            target=run_pipeline,
            args=(video_url,),
            daemon=True,
        )
        pipeline_thread.start()

        # Run API server in main thread
        run_api_server()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Speed Limit Detector")
    parser.add_argument(
        "--video",
        "-v",
        type=str,
        help="Video source URL or file path",
    )
    parser.add_argument(
        "--api-only",
        action="store_true",
        help="Only run the API server without video processing",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="API server host",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="API server port",
    )

    args = parser.parse_args()

    # Override config with command line args
    if args.host or args.port:
        config = get_config()
        config.api.host = args.host
        config.api.port = args.port

    main(video_url=args.video, api_only=args.api_only)
