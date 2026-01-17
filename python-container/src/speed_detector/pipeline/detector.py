"""YOLO-based speed sign detector.

このモジュールはフレーム画像から速度制限標識の領域を検出する責務を担う。

設計判断:
- YOLOv8を採用: リアルタイム物体検出の業界標準、PyTorchベースで使いやすい
- YOLOv4対応: OpenCV DNNを使用した速度標識特化モデルもサポート
  → traffic-sign-detector-yolov4の学習済みモデル（4クラス: Traffic lights, Speedlimit, Crosswalk, Stop）
- Lazy Loading: ultralyticsは重いライブラリのため、必要になるまでモデルをロードしない
  → インポート時間の短縮、テスト時のモデルロード回避、GPUメモリの効率的な使用
- detect_circular_signs()フォールバック: 汎用YOLOモデルは日本の速度標識を学習していない
  → 日本の速度標識の特徴「赤い円形」を従来CV手法（色抽出+輪郭検出）で補完
- DetectionResultにcropped_imageを含める: OCR用に再度画像から切り出す必要がなくなり、
  処理効率向上とコード簡潔化を実現

将来の拡張:
- Phase 3で日本の速度標識に特化したカスタムYOLOモデルを学習予定
"""

import logging
from typing import Optional
from dataclasses import dataclass

import numpy as np

from ..config import get_config, DetectorConfig
from ..shared.state import BoundingBox

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Result from YOLO detection."""

    bbox: BoundingBox
    confidence: float
    class_id: int
    class_name: str
    cropped_image: np.ndarray  # Cropped image of the detected sign


class SpeedSignDetector:
    """Detect speed limit signs using YOLO.

    For MVP, this uses a pre-trained YOLOv8 model to detect
    traffic signs. In Phase 3, a custom-trained model for
    Japanese speed signs should be used.
    """

    # Common traffic sign class names in COCO/traffic datasets
    # These may vary depending on the model used
    SPEED_SIGN_CLASSES = {
        "stop sign",
        "traffic sign",
        "speed-limit",
        "speed limit",
        "regulatory--maximum-speed-limit",
    }

    def __init__(self, config: Optional[DetectorConfig] = None):
        """Initialize the detector.

        Args:
            config: Detector configuration. If None, uses global config.
        """
        self.config = config or get_config().detector
        self._model = None

    def _load_model(self):
        """Lazy load the YOLO model."""
        if self._model is not None:
            return

        try:
            from ultralytics import YOLO

            logger.info(f"Loading YOLO model: {self.config.model_path}")
            self._model = YOLO(self.config.model_path)
            logger.info(f"Model loaded. Device: {self.config.device}")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise

    def detect(self, image: np.ndarray) -> list[DetectionResult]:
        """Detect speed signs in an image.

        Args:
            image: BGR image (numpy array).

        Returns:
            List of detection results.
        """
        self._load_model()

        # Run inference
        results = self._model(
            image,
            conf=self.config.confidence_threshold,
            device=self.config.device,
            verbose=False,
        )

        detections = []

        for result in results:
            boxes = result.boxes

            if boxes is None or len(boxes) == 0:
                continue

            for i, box in enumerate(boxes):
                # Get box coordinates
                xyxy = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = map(float, xyxy)

                # Get confidence and class
                conf = float(box.conf[0].cpu().numpy())
                cls_id = int(box.cls[0].cpu().numpy())

                # Get class name
                class_name = result.names.get(cls_id, "unknown")

                # For MVP, we accept all detections and rely on OCR to filter
                # In production, filter by speed sign classes
                # if class_name.lower() not in self.SPEED_SIGN_CLASSES:
                #     continue

                # Crop the detected region
                x1_int, y1_int = max(0, int(x1)), max(0, int(y1))
                x2_int, y2_int = min(image.shape[1], int(x2)), min(image.shape[0], int(y2))
                cropped = image[y1_int:y2_int, x1_int:x2_int].copy()

                detection = DetectionResult(
                    bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    confidence=conf,
                    class_id=cls_id,
                    class_name=class_name,
                    cropped_image=cropped,
                )
                detections.append(detection)

                logger.debug(
                    f"Detected: {class_name} (conf={conf:.2f}) at [{x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f}]"
                )

        return detections

    def detect_circular_signs(self, image: np.ndarray) -> list[DetectionResult]:
        """Detect circular regions that might be speed signs.

        This is a fallback method using traditional CV when YOLO
        doesn't have a speed sign class. It detects red circular
        regions typical of Japanese speed limit signs.

        Args:
            image: BGR image (numpy array).

        Returns:
            List of detection results for circular red regions.
        """
        import cv2

        detections = []

        # Convert to HSV for color detection
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # Red color mask (red wraps around in HSV)
        lower_red1 = np.array([0, 100, 100])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 100, 100])
        upper_red2 = np.array([180, 255, 255])

        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        red_mask = mask1 | mask2

        # Find contours
        contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 500:  # Filter small regions
                continue

            # Check circularity
            perimeter = cv2.arcLength(contour, True)
            if perimeter == 0:
                continue
            circularity = 4 * np.pi * area / (perimeter * perimeter)

            if circularity > 0.7:  # Reasonably circular
                x, y, w, h = cv2.boundingRect(contour)

                # Expand bounding box slightly
                margin = int(max(w, h) * 0.1)
                x1 = max(0, x - margin)
                y1 = max(0, y - margin)
                x2 = min(image.shape[1], x + w + margin)
                y2 = min(image.shape[0], y + h + margin)

                cropped = image[y1:y2, x1:x2].copy()

                detection = DetectionResult(
                    bbox=BoundingBox(x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2)),
                    confidence=circularity,
                    class_id=-1,
                    class_name="circular_red_sign",
                    cropped_image=cropped,
                )
                detections.append(detection)

        return detections


class YOLOv4Detector:
    """Detect speed limit signs using YOLOv4 with OpenCV DNN.

    This detector uses a pre-trained YOLOv4 model specifically trained
    for traffic sign detection (4 classes: Traffic lights, Speedlimit,
    Crosswalk, Stop signs).

    Model source: https://github.com/fredotran/traffic-sign-detector-yolov4
    """

    # Class names for the traffic sign detector model
    CLASS_NAMES = ["trafficlight", "speedlimit", "crosswalk", "stop"]

    def __init__(
        self,
        weights_path: str = "traffic-sign-detector-yolov4/weights/yolov4-rds_best_2000.weights",
        config_path: str = "traffic-sign-detector-yolov4/cfg/yolov4-rds.cfg",
        confidence_threshold: float = 0.5,
        nms_threshold: float = 0.4,
        input_size: int = 416,
    ):
        """Initialize the YOLOv4 detector.

        Args:
            weights_path: Path to YOLOv4 weights file.
            config_path: Path to YOLOv4 config file.
            confidence_threshold: Minimum confidence for detections.
            nms_threshold: Non-maximum suppression threshold.
            input_size: Input size for the network (416 or 608).
        """
        self.weights_path = weights_path
        self.config_path = config_path
        self.confidence_threshold = confidence_threshold
        self.nms_threshold = nms_threshold
        self.input_size = input_size
        self._net = None

    def _load_model(self):
        """Lazy load the YOLOv4 model."""
        if self._net is not None:
            return

        import cv2

        logger.info(f"Loading YOLOv4 model: {self.weights_path}")
        self._net = cv2.dnn.readNet(self.weights_path, self.config_path)

        # Use CPU by default (can be changed to CUDA if available)
        self._net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self._net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

        # Get output layer names
        layer_names = self._net.getLayerNames()
        unconnected = self._net.getUnconnectedOutLayers()
        # Handle both old and new OpenCV versions
        if len(unconnected.shape) == 1:
            self._output_layers = [layer_names[i - 1] for i in unconnected]
        else:
            self._output_layers = [layer_names[i[0] - 1] for i in unconnected]

        logger.info("YOLOv4 model loaded successfully")

    def detect(self, image: np.ndarray) -> list[DetectionResult]:
        """Detect traffic signs in an image.

        Args:
            image: BGR image (numpy array).

        Returns:
            List of detection results.
        """
        import cv2

        self._load_model()

        height, width = image.shape[:2]

        # Create blob from image
        blob = cv2.dnn.blobFromImage(
            image, 1 / 255.0, (self.input_size, self.input_size), [0, 0, 0], swapRB=True, crop=False
        )
        self._net.setInput(blob)

        # Forward pass
        outputs = self._net.forward(self._output_layers)

        # Process detections
        boxes = []
        confidences = []
        class_ids = []

        for output in outputs:
            for detection in output:
                scores = detection[5:]
                class_id = np.argmax(scores)
                confidence = scores[class_id]

                if confidence > self.confidence_threshold:
                    # Scale bounding box back to image size
                    center_x = int(detection[0] * width)
                    center_y = int(detection[1] * height)
                    w = int(detection[2] * width)
                    h = int(detection[3] * height)

                    # Get top-left corner
                    x = int(center_x - w / 2)
                    y = int(center_y - h / 2)

                    boxes.append([x, y, w, h])
                    confidences.append(float(confidence))
                    class_ids.append(class_id)

        # Apply non-maximum suppression
        indices = cv2.dnn.NMSBoxes(boxes, confidences, self.confidence_threshold, self.nms_threshold)

        detections = []

        if len(indices) > 0:
            # Handle both old and new OpenCV versions
            if isinstance(indices, np.ndarray) and len(indices.shape) == 2:
                indices = indices.flatten()

            for i in indices:
                x, y, w, h = boxes[i]

                # Ensure coordinates are within image bounds
                x1 = max(0, x)
                y1 = max(0, y)
                x2 = min(width, x + w)
                y2 = min(height, y + h)

                # Crop the detected region
                cropped = image[y1:y2, x1:x2].copy()

                class_name = self.CLASS_NAMES[class_ids[i]] if class_ids[i] < len(self.CLASS_NAMES) else "unknown"

                detection_result = DetectionResult(
                    bbox=BoundingBox(x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2)),
                    confidence=confidences[i],
                    class_id=class_ids[i],
                    class_name=class_name,
                    cropped_image=cropped,
                )
                detections.append(detection_result)

                logger.debug(
                    f"YOLOv4 Detected: {class_name} (conf={confidences[i]:.2f}) at [{x1},{y1},{x2},{y2}]"
                )

        return detections
