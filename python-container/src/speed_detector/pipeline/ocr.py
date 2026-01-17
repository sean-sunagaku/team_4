"""EasyOCR-based number reading for speed signs.

このモジュールは検出された標識領域から数字を読み取る責務を担う。

設計判断:
- EasyOCRを採用: 多言語対応（日本語数字に強い）、GPU/CPU両対応、セットアップ簡単
- allowlist="0123456789": 速度標識に含まれるのは数字のみ
  → "O"を"0"と誤認識するなどの誤読を大幅に削減
- VALID_SPEED_LIMITS による検証: 日本の法定速度は決まっている（20,30,40,50,60,70,80,100,120）
  → "45"や"73"などの誤読を排除し、信頼性向上
- read_with_preprocessing()で複数手法試行: 照明条件によって最適な前処理が異なる
  → オリジナル、二値化、コントラスト強調を試して最高信頼度の結果を採用
- TimeCondition対応: 日本には「7-19」のような時間帯限定の速度制限があるため、
  OCRで時間条件も読み取り可能に

OCR精度向上のポイント:
1. 画像の前処理（二値化、コントラスト強調）
2. 数字のみを許可するallowlist
3. 有効な速度制限値での検証
"""

import logging
import re
from typing import Optional
from dataclasses import dataclass

import numpy as np

from ..config import get_config, OCRConfig
from ..shared.state import TimeCondition

logger = logging.getLogger(__name__)


# 日本の法定速度制限値
# これ以外の値（45, 73など）は誤読として排除する
VALID_SPEED_LIMITS = {20, 30, 40, 50, 60, 70, 80, 100, 120}


@dataclass
class OCRResult:
    """Result from OCR reading."""

    speed_limit: int
    confidence: float
    time_condition: Optional[TimeCondition] = None
    raw_text: str = ""


class SpeedOCR:
    """Read speed limit numbers from sign images using EasyOCR.

    This class handles:
    - Reading digits from speed sign images
    - Parsing time-based conditions (e.g., '7-19')
    - Validating detected speed limits
    """

    def __init__(self, config: Optional[OCRConfig] = None):
        """Initialize the OCR reader.

        Args:
            config: OCR configuration. If None, uses global config.
        """
        self.config = config or get_config().ocr
        self._reader = None

    def _load_reader(self):
        """Lazy load the EasyOCR reader."""
        if self._reader is not None:
            return

        try:
            import easyocr

            logger.info(f"Loading EasyOCR reader. GPU: {self.config.gpu}")
            self._reader = easyocr.Reader(
                self.config.languages,
                gpu=self.config.gpu,
            )
            logger.info("EasyOCR reader loaded")
        except Exception as e:
            logger.error(f"Failed to load EasyOCR reader: {e}")
            raise

    def read(self, image: np.ndarray) -> Optional[OCRResult]:
        """Read speed limit from a sign image.

        Args:
            image: BGR image of the cropped sign (numpy array).

        Returns:
            OCRResult if a valid speed limit is found, None otherwise.
        """
        self._load_reader()

        # Run OCR with digit-only allowlist
        try:
            results = self._reader.readtext(
                image,
                allowlist=self.config.allowlist + "-:",  # Include - and : for time conditions
                paragraph=False,
            )
        except Exception as e:
            logger.warning(f"OCR failed: {e}")
            return None

        if not results:
            return None

        # Combine all detected text
        all_text = " ".join([text for _, text, _ in results])
        logger.debug(f"OCR raw text: {all_text}")

        # Try to parse speed limit and time condition
        return self._parse_speed_limit(all_text, results)

    def _parse_speed_limit(
        self, text: str, ocr_results: list
    ) -> Optional[OCRResult]:
        """Parse speed limit from OCR text.

        Args:
            text: Combined OCR text.
            ocr_results: Raw OCR results with confidence.

        Returns:
            OCRResult if valid, None otherwise.
        """
        # Clean up text
        text = text.strip()

        # Look for time condition pattern (e.g., "7-19", "7:00-19:00")
        time_pattern = r"(\d{1,2}(?::\d{2})?-\d{1,2}(?::\d{2})?)"
        time_match = re.search(time_pattern, text)
        time_condition = None

        if time_match:
            time_str = time_match.group(1)
            time_condition = TimeCondition.from_string(time_str)
            # Remove time condition from text for speed parsing
            text = text.replace(time_str, " ")

        # Extract all numbers from text
        numbers = re.findall(r"\d+", text)

        if not numbers:
            return None

        # Find the most likely speed limit
        speed_limit = None
        best_confidence = 0.0

        for num_str in numbers:
            try:
                num = int(num_str)

                # Check if it's a valid speed limit
                if num in VALID_SPEED_LIMITS:
                    # Find confidence for this number
                    for bbox, ocr_text, conf in ocr_results:
                        if num_str in ocr_text:
                            if conf > best_confidence:
                                speed_limit = num
                                best_confidence = conf
                            break
                    else:
                        # Default confidence if not found
                        if speed_limit is None:
                            speed_limit = num
                            best_confidence = 0.5

            except ValueError:
                continue

        if speed_limit is None:
            # Try to infer speed limit from partial readings
            for num_str in numbers:
                try:
                    num = int(num_str)
                    # Common OCR errors: "4" instead of "40", "6" instead of "60"
                    if num < 10:
                        possible = num * 10
                        if possible in VALID_SPEED_LIMITS:
                            speed_limit = possible
                            best_confidence = 0.3  # Lower confidence for inferred values
                            break
                except ValueError:
                    continue

        if speed_limit is None:
            return None

        return OCRResult(
            speed_limit=speed_limit,
            confidence=best_confidence,
            time_condition=time_condition,
            raw_text=text,
        )

    def read_with_preprocessing(self, image: np.ndarray) -> Optional[OCRResult]:
        """Read speed limit with image preprocessing for better accuracy.

        Args:
            image: BGR image of the cropped sign.

        Returns:
            OCRResult if valid, None otherwise.
        """
        import cv2

        # Try multiple preprocessing approaches
        results = []

        # 1. Original image
        result = self.read(image)
        if result:
            results.append(result)

        # 2. Grayscale + threshold
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        result = self.read(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR))
        if result:
            results.append(result)

        # 3. Contrast enhancement
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        result = self.read(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))
        if result:
            results.append(result)

        # Return the result with highest confidence
        if not results:
            return None

        return max(results, key=lambda r: r.confidence)
