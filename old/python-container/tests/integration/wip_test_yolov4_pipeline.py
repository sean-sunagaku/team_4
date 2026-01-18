"""YOLOv4 traffic sign detection pipeline tests.

NOTE: このファイルは動作未確認のため、デフォルトではスキップされます。
ファイル名が 'wip_' で始まるため pytest は自動収集しません。

実行方法:
    # このファイルのテストを実行
    pytest tests/integration/wip_test_yolov4_pipeline.py -v

    # 特定のテストのみ
    pytest tests/integration/wip_test_yolov4_pipeline.py::TestYOLOv4Pipeline::test_yolov4_class_names -v

セットアップ:
    1. YOLOv4モデルのセットアップ（README参照）
    2. sample_movie.mp4 が必要
"""

import pytest
from pathlib import Path
import cv2
import numpy as np

from src.speed_detector.pipeline.grabber import FrameGrabber
from src.speed_detector.pipeline.state_manager import StateManager, create_detection
from src.speed_detector.shared.state import DetectionStatus


# Check for optional dependencies
try:
    import easyocr
    HAS_EASYOCR = True
except ImportError:
    HAS_EASYOCR = False


# Paths
SAMPLE_VIDEO_PATH = Path(__file__).parent.parent.parent / "sample_movie.mp4"
YOLOV4_WEIGHTS = Path(__file__).parent.parent.parent / "traffic-sign-detector-yolov4/weights/yolov4-rds_best_2000.weights"
YOLOV4_CONFIG = Path(__file__).parent.parent.parent / "traffic-sign-detector-yolov4/cfg/yolov4-rds.cfg"
HAS_YOLOV4 = YOLOV4_WEIGHTS.exists() and YOLOV4_CONFIG.exists()


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
def yolov4_detector():
    """Create a YOLOv4Detector (requires model files)."""
    if not HAS_YOLOV4:
        pytest.skip("YOLOv4 model files not found - see README for setup")
    from src.speed_detector.pipeline.detector import YOLOv4Detector
    return YOLOv4Detector(
        weights_path=str(YOLOV4_WEIGHTS),
        config_path=str(YOLOV4_CONFIG),
        confidence_threshold=0.3,
    )


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
class TestYOLOv4Pipeline:
    """YOLOv4 traffic sign detection tests."""

    def test_yolov4_detector_loads(self, yolov4_detector):
        """Test that YOLOv4 model loads successfully."""
        dummy_image = np.zeros((416, 416, 3), dtype=np.uint8)
        detections = yolov4_detector.detect(dummy_image)
        assert isinstance(detections, list)

    def test_yolov4_detects_speedlimit(self, grabber, yolov4_detector):
        """Test that YOLOv4 detects speedlimit signs in sample video."""
        from src.speed_detector.pipeline.detector import DetectionResult

        grabber.open()
        speedlimit_found = False
        frames_tested = 0
        max_frames = 150

        for frame in grabber.frames():
            detections = yolov4_detector.detect(frame.image)

            for det in detections:
                assert isinstance(det, DetectionResult)
                assert det.confidence >= 0 and det.confidence <= 1
                assert det.cropped_image is not None

                if det.class_name == "speedlimit":
                    speedlimit_found = True

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        assert speedlimit_found, "No speedlimit sign detected in sample video"

    def test_yolov4_with_ocr(self, grabber, yolov4_detector, ocr):
        """Test YOLOv4 detection combined with OCR reading."""
        from src.speed_detector.pipeline.ocr import OCRResult

        grabber.open()
        ocr_success = False
        frames_tested = 0
        max_frames = 150

        for frame in grabber.frames():
            detections = yolov4_detector.detect(frame.image)

            for det in detections:
                if det.class_name == "speedlimit":
                    # Enlarge small images for better OCR
                    h, w = det.cropped_image.shape[:2]
                    if w < 100 or h < 100:
                        scale = max(100 // w, 100 // h, 1) + 1
                        enlarged = cv2.resize(
                            det.cropped_image,
                            (w * scale, h * scale),
                            interpolation=cv2.INTER_CUBIC
                        )
                    else:
                        enlarged = det.cropped_image

                    result = ocr.read_with_preprocessing(enlarged)

                    if result is not None:
                        assert isinstance(result, OCRResult)
                        assert result.speed_limit > 0
                        assert result.confidence >= 0 and result.confidence <= 1
                        ocr_success = True

            frames_tested += 1
            if frames_tested >= max_frames:
                break

        assert ocr_success, "OCR failed to read any speed limit value"

    def test_yolov4_full_pipeline(self, grabber, yolov4_detector, ocr, state_manager):
        """Test complete YOLOv4 pipeline from video to confirmed state."""
        grabber.open()
        frames_processed = 0
        max_frames = 150
        confirmed_speed = None

        for frame in grabber.frames():
            detections = yolov4_detector.detect(frame.image)

            if detections:
                speedlimit_dets = [d for d in detections if d.class_name == "speedlimit"]

                if speedlimit_dets:
                    best = max(speedlimit_dets, key=lambda d: d.confidence)

                    # Enlarge for OCR
                    h, w = best.cropped_image.shape[:2]
                    if w < 100 or h < 100:
                        scale = max(100 // w, 100 // h, 1) + 1
                        enlarged = cv2.resize(
                            best.cropped_image,
                            (w * scale, h * scale),
                            interpolation=cv2.INTER_CUBIC
                        )
                    else:
                        enlarged = best.cropped_image

                    ocr_result = ocr.read_with_preprocessing(enlarged)

                    if ocr_result:
                        detection = create_detection(
                            speed_limit=ocr_result.speed_limit,
                            confidence=ocr_result.confidence,
                            time_condition=ocr_result.time_condition,
                        )
                        state = state_manager.update(detection)

                        if state.confirmed_speed_limit:
                            confirmed_speed = state.confirmed_speed_limit.speed_limit
                    else:
                        state_manager.update(None)
                else:
                    state_manager.update(None)
            else:
                state_manager.update(None)

            frames_processed += 1
            if frames_processed >= max_frames:
                break

        assert confirmed_speed is not None, "Pipeline failed to confirm any speed limit"
        assert confirmed_speed == 40, f"Expected 40 km/h, got {confirmed_speed}"

    def test_yolov4_class_names(self, yolov4_detector):
        """Test that YOLOv4 detector has correct class names."""
        expected_classes = ["trafficlight", "speedlimit", "crosswalk", "stop"]
        assert yolov4_detector.CLASS_NAMES == expected_classes
