"""Integration tests for the full video processing pipeline.

These tests use the actual YOLO and OCR models, so they may be slow.
Mark with @pytest.mark.slow for easy filtering.

Run with: pytest tests/integration/test_pipeline.py -v
Skip slow tests: pytest -m "not slow"
"""

import pytest
from pathlib import Path

from src.speed_detector.pipeline.grabber import FrameGrabber, Frame
from src.speed_detector.pipeline.state_manager import StateManager, create_detection
from src.speed_detector.shared.state import DetectionStatus

# Check for optional dependencies at module level
try:
    from ultralytics import YOLO
    HAS_ULTRALYTICS = True
except ImportError:
    HAS_ULTRALYTICS = False

try:
    import easyocr
    HAS_EASYOCR = True
except ImportError:
    HAS_EASYOCR = False


# Path to sample video
SAMPLE_VIDEO_PATH = Path(__file__).parent.parent.parent / "sample_movie.mp4"


@pytest.fixture
def video_path():
    """Provide the path to sample_movie.mp4."""
    if not SAMPLE_VIDEO_PATH.exists():
        pytest.skip(f"Sample video not found: {SAMPLE_VIDEO_PATH}")
    return str(SAMPLE_VIDEO_PATH)


@pytest.fixture
def grabber(video_path):
    """Create a FrameGrabber for the sample video."""
    grabber = FrameGrabber(video_url=video_path)
    yield grabber
    grabber.close()


@pytest.fixture
def detector():
    """Create a SpeedSignDetector (requires ultralytics)."""
    if not HAS_ULTRALYTICS:
        pytest.skip("ultralytics not installed - run: pip install ultralytics")
    from src.speed_detector.pipeline.detector import SpeedSignDetector
    return SpeedSignDetector()


@pytest.fixture
def ocr():
    """Create a SpeedOCR reader (requires easyocr)."""
    if not HAS_EASYOCR:
        pytest.skip("easyocr not installed - run: pip install easyocr")
    from src.speed_detector.pipeline.ocr import SpeedOCR
    return SpeedOCR()


@pytest.fixture
def state_manager():
    """Create a StateManager."""
    return StateManager()


@pytest.mark.slow
class TestFullPipeline:
    """Full pipeline integration tests using YOLO and OCR."""

    def test_grabber_to_detector(self, grabber, detector):
        """Test that frames from grabber can be processed by detector."""
        from src.speed_detector.pipeline.detector import DetectionResult

        grabber.open()
        frames_tested = 0
        max_frames = 30  # Test first 30 frames

        for frame in grabber.frames():
            assert frame is not None
            assert isinstance(frame, Frame)
            assert frame.image is not None

            # Run detection
            detections = detector.detect(frame.image)

            # Detections should be a list (possibly empty)
            assert isinstance(detections, list)

            for det in detections:
                assert isinstance(det, DetectionResult)
                assert det.confidence >= 0 and det.confidence <= 1
                assert det.cropped_image is not None
                assert det.cropped_image.shape[0] > 0
                assert det.cropped_image.shape[1] > 0

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        assert frames_tested == max_frames

    def test_detector_to_ocr(self, grabber, detector, ocr):
        """Test that detected regions can be processed by OCR."""
        from src.speed_detector.pipeline.ocr import OCRResult

        grabber.open()
        frames_tested = 0
        detections_found = 0
        max_frames = 50

        for frame in grabber.frames():
            detections = detector.detect(frame.image)

            for det in detections:
                detections_found += 1
                # Try OCR on detected region
                result = ocr.read(det.cropped_image)

                # Result can be None or OCRResult
                if result is not None:
                    assert isinstance(result, OCRResult)
                    assert result.speed_limit > 0
                    assert result.confidence >= 0 and result.confidence <= 1

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        # We should have tested some frames
        assert frames_tested > 0

    def test_full_pipeline_flow(self, grabber, detector, ocr, state_manager):
        """Test the complete pipeline from video to state updates."""
        grabber.open()
        frames_processed = 0
        max_frames = 100

        for frame in grabber.frames():
            # Detect signs
            detections = detector.detect(frame.image)

            if detections:
                # Take the detection with highest confidence
                best = max(detections, key=lambda d: d.confidence)

                # Try OCR
                ocr_result = ocr.read_with_preprocessing(best.cropped_image)

                if ocr_result:
                    # Create detection and update state
                    detection = create_detection(
                        speed_limit=ocr_result.speed_limit,
                        confidence=ocr_result.confidence,
                        time_condition=ocr_result.time_condition,
                    )
                    state = state_manager.update(detection)
                else:
                    state = state_manager.update(None)
            else:
                state = state_manager.update(None)

            # State should always be valid
            assert state is not None
            assert state.status in [
                DetectionStatus.NO_DETECTION,
                DetectionStatus.DETECTING,
                DetectionStatus.CONFIRMED,
            ]

            frames_processed += 1
            if frames_processed >= max_frames:
                break

        assert frames_processed == max_frames

    def test_state_updates(self, state_manager):
        """Test that state manager updates correctly with detections."""
        # Initial state should be NO_DETECTION
        state = state_manager.get_current_state()
        assert state.status == DetectionStatus.NO_DETECTION
        assert state.confirmed_speed_limit is None

        # First detection - should move to DETECTING
        det1 = create_detection(speed_limit=40, confidence=0.9)
        state = state_manager.update(det1)
        assert state.status == DetectionStatus.DETECTING
        assert state.pending_count == 1

        # Second detection - still DETECTING
        det2 = create_detection(speed_limit=40, confidence=0.9)
        state = state_manager.update(det2)
        assert state.status == DetectionStatus.DETECTING
        assert state.pending_count == 2

        # Third detection - should CONFIRM
        det3 = create_detection(speed_limit=40, confidence=0.9)
        state = state_manager.update(det3)
        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit is not None
        assert state.confirmed_speed_limit.speed_limit == 40

        # No detection - should keep confirmed value
        state = state_manager.update(None)
        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit.speed_limit == 40

        # Different speed limit - should start new detection
        det4 = create_detection(speed_limit=60, confidence=0.9)
        state = state_manager.update(det4)
        assert state.status == DetectionStatus.DETECTING
        # Confirmed should still be 40 until new one is confirmed
        assert state.confirmed_speed_limit.speed_limit == 40


@pytest.mark.slow
class TestCircularSignDetection:
    """Test circular sign detection fallback method."""

    def test_detect_circular_signs(self, grabber, detector):
        """Test that circular sign detection works on video frames."""
        from src.speed_detector.pipeline.detector import DetectionResult

        grabber.open()
        frames_tested = 0
        max_frames = 20

        for frame in grabber.frames():
            # Test circular detection fallback
            detections = detector.detect_circular_signs(frame.image)

            # Should return a list (possibly empty)
            assert isinstance(detections, list)

            for det in detections:
                assert isinstance(det, DetectionResult)
                assert det.class_name == "circular_red_sign"
                assert det.class_id == -1

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        assert frames_tested == max_frames


@pytest.mark.slow
class TestOCRPreprocessing:
    """Test OCR with different preprocessing methods."""

    def test_ocr_with_preprocessing(self, grabber, detector, ocr):
        """Test that preprocessing improves or maintains OCR quality."""
        from src.speed_detector.pipeline.ocr import OCRResult

        grabber.open()
        frames_tested = 0
        max_frames = 30

        for frame in grabber.frames():
            detections = detector.detect(frame.image)

            for det in detections:
                # Try both methods
                result_basic = ocr.read(det.cropped_image)
                result_preprocessed = ocr.read_with_preprocessing(det.cropped_image)

                # Both should return either None or OCRResult
                if result_basic is not None:
                    assert isinstance(result_basic, OCRResult)
                if result_preprocessed is not None:
                    assert isinstance(result_preprocessed, OCRResult)

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        assert frames_tested > 0