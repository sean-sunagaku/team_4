"""WebSocket endpoint for real-time frame processing.

This module handles receiving video frames from the frontend
and processing them through the speed sign detection pipeline.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["frames"])

# OCR reader (lazy loaded)
_ocr_reader = None

# Valid Japanese speed limits
VALID_SPEED_LIMITS = {20, 30, 40, 50, 60, 70, 80, 100, 120}


def get_ocr_reader():
    """Lazy load EasyOCR reader."""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        logger.info("Loading EasyOCR reader for frame processing...")
        _ocr_reader = easyocr.Reader(['en'], gpu=False)
        logger.info("EasyOCR reader loaded")
    return _ocr_reader


def detect_circular_red_signs(image: np.ndarray) -> list:
    """Detect circular red signs in an image.

    Returns list of detections with cropped images.
    """
    detections = []

    # Convert to HSV
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

            detections.append({
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "circularity": circularity,
                "cropped": cropped
            })

    return detections


def read_speed_from_sign(image: np.ndarray) -> Optional[int]:
    """Read speed limit value from a sign image.

    Returns the speed limit if detected, None otherwise.
    """
    import re

    reader = get_ocr_reader()

    try:
        h, w = image.shape[:2]

        # Resize if too small
        if h < 100 or w < 100:
            scale = max(100 / h, 100 / w)
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # Try multiple preprocessing approaches
        images_to_try = [image]

        # Grayscale + contrast enhancement
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        images_to_try.append(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))

        # Binary threshold
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        images_to_try.append(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR))

        all_results = []
        for img in images_to_try:
            results = reader.readtext(img, allowlist="0123456789", paragraph=False)
            if results:
                all_results.extend(results)

        if not all_results:
            return None

        # Combine all detected text
        all_text = " ".join([text for _, text, _ in all_results])
        numbers = re.findall(r"\d+", all_text)

        if not numbers:
            return None

        # Find valid speed limit
        for num_str in numbers:
            try:
                num = int(num_str)
                if num in VALID_SPEED_LIMITS:
                    return num
            except ValueError:
                continue

        return None

    except Exception as e:
        logger.warning(f"OCR failed: {e}")
        return None


class FrameStateManager:
    """Manages detection state with 3-frame confirmation."""

    def __init__(self, confirmation_frames: int = 3):
        self.confirmation_frames = confirmation_frames
        self._pending_speed: Optional[int] = None
        self._pending_count: int = 0
        self._confirmed_speed: Optional[int] = None
        self._confirmed_at: Optional[datetime] = None

    def update(self, detected_speed: Optional[int]) -> dict:
        """Update state with new detection.

        Returns dict with status and speed_limit.
        """
        if detected_speed is None:
            # No detection - reset pending but keep confirmed
            self._pending_speed = None
            self._pending_count = 0

            if self._confirmed_speed is not None:
                return {
                    "status": "confirmed",
                    "speed_limit": self._confirmed_speed,
                    "timestamp": self._confirmed_at.isoformat() if self._confirmed_at else None
                }
            else:
                return {
                    "status": "no_detection",
                    "speed_limit": None,
                    "timestamp": None
                }

        # Check if same as confirmed
        if self._confirmed_speed == detected_speed:
            # Update last seen
            return {
                "status": "confirmed",
                "speed_limit": self._confirmed_speed,
                "timestamp": self._confirmed_at.isoformat() if self._confirmed_at else None
            }

        # Check if same as pending
        if self._pending_speed == detected_speed:
            self._pending_count += 1

            if self._pending_count >= self.confirmation_frames:
                # Confirmed!
                self._confirmed_speed = detected_speed
                self._confirmed_at = datetime.now()
                self._pending_speed = None
                self._pending_count = 0

                logger.info(f"Speed limit {detected_speed} CONFIRMED")

                return {
                    "status": "confirmed",
                    "speed_limit": self._confirmed_speed,
                    "timestamp": self._confirmed_at.isoformat()
                }
            else:
                return {
                    "status": "detecting",
                    "speed_limit": detected_speed,
                    "pending_count": self._pending_count,
                    "timestamp": None
                }
        else:
            # New speed detected - reset pending
            self._pending_speed = detected_speed
            self._pending_count = 1

            return {
                "status": "detecting",
                "speed_limit": detected_speed,
                "pending_count": 1,
                "timestamp": None
            }

    def reset(self):
        """Reset state manager."""
        self._pending_speed = None
        self._pending_count = 0
        self._confirmed_speed = None
        self._confirmed_at = None


@router.websocket("/ws/frames")
async def websocket_frame_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time frame processing.

    Receives: Binary JPEG image data
    Sends: JSON detection results

    Message format (sent):
    {
        "type": "detection_result",
        "status": "confirmed" | "detecting" | "no_detection",
        "speed_limit": 40 | null,
        "timestamp": "2024-01-15T10:30:00" | null
    }
    """
    await websocket.accept()
    logger.info("Frame WebSocket connected")

    # Create state manager for this connection
    state_manager = FrameStateManager(confirmation_frames=2)

    try:
        while True:
            # Receive binary frame data
            data = await websocket.receive_bytes()

            # Decode JPEG to image
            nparr = np.frombuffer(data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                await websocket.send_json({
                    "type": "error",
                    "message": "Failed to decode image"
                })
                continue

            # Detect circular red signs
            detections = detect_circular_red_signs(image)

            detected_speed = None

            # Process detections
            for detection in detections:
                speed = read_speed_from_sign(detection["cropped"])
                if speed is not None:
                    detected_speed = speed
                    logger.debug(f"Detected speed: {speed}")
                    break  # Take first valid detection

            # Update state
            result = state_manager.update(detected_speed)

            # Send result
            await websocket.send_json({
                "type": "detection_result",
                **result
            })

    except WebSocketDisconnect:
        logger.info("Frame WebSocket disconnected")
    except Exception as e:
        logger.error(f"Frame WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
        except:
            pass
