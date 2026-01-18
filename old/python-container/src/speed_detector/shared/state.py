"""Data structures for speed limit detection state.

このモジュールはシステム全体で使用するデータ構造を定義する。

設計判断:
- dataclassを採用: イミュータブル性、型安全性、自動生成メソッド（__eq__, __repr__）
- 明確な責務分離:
  - BoundingBox: 検出領域の座標
  - TimeCondition: 時間条件（7-19など）
  - SpeedLimitDetection: 1フレームの検出結果
  - ConfirmedSpeedLimit: 確定済み速度制限
  - CurrentState: システム全体の現在状態

- CurrentStateの設計:
  - confirmedとpendingを分離: 確定前の中間状態を表現可能
  - UIで「確認中: 40km/h (2/3)」のような表示が可能
  - デバッグ・監視が容易

- TimeConditionの設計:
  - 日本には「7-19」のような時間帯限定の速度制限がある
  - is_active()で現在時刻に有効か判定
  - オーバーナイト対応（22-6時など）も考慮
"""

from dataclasses import dataclass, field
from datetime import datetime, time
from enum import Enum
from typing import Optional
import re


class DetectionStatus(Enum):
    """Status of the current speed limit detection."""

    NO_DETECTION = "no_detection"  # No speed limit has ever been detected
    DETECTING = "detecting"  # Currently detecting, waiting for confirmation
    CONFIRMED = "confirmed"  # Speed limit confirmed (3+ frames)


@dataclass
class TimeCondition:
    """Time-based condition for speed limits (e.g., '7-19' means 7:00-19:00)."""

    start_hour: int
    end_hour: int
    start_minute: int = 0
    end_minute: int = 0

    def is_active(self, current_time: Optional[time] = None) -> bool:
        """Check if the time condition is currently active."""
        if current_time is None:
            current_time = datetime.now().time()

        start = time(self.start_hour, self.start_minute)
        end = time(self.end_hour, self.end_minute)

        if start <= end:
            # Normal case: e.g., 7:00 - 19:00
            return start <= current_time <= end
        else:
            # Overnight case: e.g., 22:00 - 6:00
            return current_time >= start or current_time <= end

    @classmethod
    def from_string(cls, time_str: str) -> Optional["TimeCondition"]:
        """Parse time condition from string like '7-19' or '7:30-19:00'.

        Args:
            time_str: Time range string (e.g., '7-19', '7:30-19:00')

        Returns:
            TimeCondition if valid, None otherwise
        """
        # Pattern: "HH-HH" or "HH:MM-HH:MM"
        pattern = r"(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?"
        match = re.match(pattern, time_str.strip())

        if not match:
            return None

        start_hour = int(match.group(1))
        start_minute = int(match.group(2)) if match.group(2) else 0
        end_hour = int(match.group(3))
        end_minute = int(match.group(4)) if match.group(4) else 0

        # Validate hours and minutes
        if not (0 <= start_hour <= 23 and 0 <= end_hour <= 23):
            return None
        if not (0 <= start_minute <= 59 and 0 <= end_minute <= 59):
            return None

        return cls(
            start_hour=start_hour,
            end_hour=end_hour,
            start_minute=start_minute,
            end_minute=end_minute,
        )

    def __str__(self) -> str:
        if self.start_minute == 0 and self.end_minute == 0:
            return f"{self.start_hour}-{self.end_hour}"
        return f"{self.start_hour:02d}:{self.start_minute:02d}-{self.end_hour:02d}:{self.end_minute:02d}"


@dataclass
class BoundingBox:
    """Bounding box for detected speed sign."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


@dataclass
class SpeedLimitDetection:
    """A single speed limit detection from one frame."""

    speed_limit: int  # The detected speed limit value (e.g., 40, 50, 60)
    confidence: float  # Detection confidence (0.0 - 1.0)
    bbox: BoundingBox  # Bounding box of the detected sign
    time_condition: Optional[TimeCondition] = None  # Optional time-based condition
    timestamp: datetime = field(default_factory=datetime.now)

    def is_currently_active(self) -> bool:
        """Check if this speed limit is currently active based on time condition."""
        if self.time_condition is None:
            return True
        return self.time_condition.is_active()


@dataclass
class ConfirmedSpeedLimit:
    """A confirmed speed limit after 3+ consecutive frame detections."""

    speed_limit: int
    time_condition: Optional[TimeCondition] = None
    confirmed_at: datetime = field(default_factory=datetime.now)
    last_seen_at: datetime = field(default_factory=datetime.now)
    detection_count: int = 0  # Total number of times this limit was detected

    def is_currently_active(self) -> bool:
        """Check if this speed limit is currently active based on time condition."""
        if self.time_condition is None:
            return True
        return self.time_condition.is_active()

    def update_last_seen(self) -> None:
        """Update the last seen timestamp."""
        self.last_seen_at = datetime.now()
        self.detection_count += 1


@dataclass
class CurrentState:
    """The current state of the speed limit detector."""

    status: DetectionStatus = DetectionStatus.NO_DETECTION
    confirmed_speed_limit: Optional[ConfirmedSpeedLimit] = None
    pending_detection: Optional[SpeedLimitDetection] = None
    pending_count: int = 0  # Number of consecutive frames with same detection
    last_updated: datetime = field(default_factory=datetime.now)

    def get_effective_speed_limit(self) -> Optional[int]:
        """Get the effective speed limit considering time conditions.

        Returns:
            The speed limit if confirmed and currently active, None otherwise.
        """
        if self.confirmed_speed_limit is None:
            return None
        if not self.confirmed_speed_limit.is_currently_active():
            return None
        return self.confirmed_speed_limit.speed_limit

    def to_dict(self) -> dict:
        """Convert state to dictionary for API response."""
        result = {
            "status": self.status.value,
            "last_updated": self.last_updated.isoformat(),
        }

        if self.confirmed_speed_limit is not None:
            result["speed_limit"] = self.confirmed_speed_limit.speed_limit
            result["effective_speed_limit"] = self.get_effective_speed_limit()
            result["confirmed_at"] = self.confirmed_speed_limit.confirmed_at.isoformat()
            result["last_seen_at"] = self.confirmed_speed_limit.last_seen_at.isoformat()

            if self.confirmed_speed_limit.time_condition is not None:
                tc = self.confirmed_speed_limit.time_condition
                result["time_condition"] = {
                    "range": str(tc),
                    "is_active": tc.is_active(),
                }

        return result
