"""State manager for speed limit detection with 3-frame confirmation.

このモジュールは検出結果を集約し、3フレーム確認ロジックで状態を管理する責務を担う。

=== 設計判断: なぜ3フレーム確認か？ ===

理由1: ノイズ耐性
- 1フレームの誤検出で状態が変わらない
- 例: 一瞬だけ「60」と誤認識しても確定しない

理由2: 応答性
- 3フレーム ≈ 0.1秒（30fps時）で十分速い
- 運転中に違和感のない応答速度

理由3: 安定性
- 表示のちらつきを防止
- ユーザーが混乱しない

=== 設計判断: なぜ確定値を永続保持か？ ===

理由1: 実世界の挙動を模倣
- 一度見た標識は、次の標識まで有効
- 運転者の認識と一致

理由2: 一時的遮蔽への対応
- トンネル、木の影で見えなくなっても値を維持
- カメラの一時的な不具合にも耐性

理由3: 新標識で即更新
- 新しい標識が確定したら即座に切り替え
- 古い値に固執しない

=== 状態遷移 ===

Frame 1: 40 km/h 検出 → DETECTING (1/3)
Frame 2: 40 km/h 検出 → DETECTING (2/3)
Frame 3: 40 km/h 検出 → CONFIRMED ✓
Frame 4: 検出なし      → CONFIRMED (値を維持)
Frame 5: 60 km/h 検出 → DETECTING (1/3) ← 新しい標識

Key behaviors:
1. New sign detected → 3 consecutive frames needed to confirm
2. Same sign continues → Keep confirmed state
3. Sign disappears → Keep last confirmed value forever (until new sign detected)
4. New different sign → Immediately start confirmation for new sign
"""

import logging
from datetime import datetime
from typing import Optional

from ..config import get_config, StateConfig
from ..shared.state import (
    CurrentState,
    DetectionStatus,
    SpeedLimitDetection,
    ConfirmedSpeedLimit,
    TimeCondition,
    BoundingBox,
)
from ..shared.memory import SharedMemory, get_shared_memory

logger = logging.getLogger(__name__)


class StateManager:
    """Manage the detection state with 3-frame confirmation logic.

    State update rules:
    1. New sign detected → Count consecutive detections, confirm at 3
    2. Same sign continues → Update last_seen timestamp
    3. Sign not visible → Keep last confirmed value (never clear)
    4. Different sign detected → Reset counter, start new confirmation

    This ensures:
    - Noise filtering via 3-frame confirmation
    - Immediate update when new sign is confirmed
    - Persistent value retention when sign is not visible
    """

    def __init__(
        self,
        config: Optional[StateConfig] = None,
        shared_memory: Optional[SharedMemory] = None,
    ):
        """Initialize the state manager.

        Args:
            config: State configuration. If None, uses global config.
            shared_memory: Shared memory instance. If None, uses global instance.
        """
        self.config = config or get_config().state
        self._memory = shared_memory or get_shared_memory()
        self._pending_speed_limit: Optional[int] = None
        self._pending_time_condition: Optional[TimeCondition] = None
        self._pending_count: int = 0

    def update(self, detection: Optional[SpeedLimitDetection]) -> CurrentState:
        """Update state based on a new detection (or no detection).

        Args:
            detection: The detection from current frame, or None if nothing detected.

        Returns:
            The updated current state.
        """
        state = self._memory.get_state()

        if detection is None:
            # No detection in this frame
            return self._handle_no_detection(state)
        else:
            # Something was detected
            return self._handle_detection(state, detection)

    def _handle_no_detection(self, state: CurrentState) -> CurrentState:
        """Handle frame with no detection.

        Behavior: Keep the last confirmed value. Reset pending counter.
        """
        # Reset pending detection counter
        self._pending_speed_limit = None
        self._pending_time_condition = None
        self._pending_count = 0

        # Keep existing state (confirmed value persists)
        # Only update the pending fields in state
        state.pending_detection = None
        state.pending_count = 0

        # Status stays the same (CONFIRMED if we had one, NO_DETECTION if we never had one)
        self._memory.update_state(state)
        return state

    def _handle_detection(
        self, state: CurrentState, detection: SpeedLimitDetection
    ) -> CurrentState:
        """Handle frame with a detection.

        Behavior:
        - If same as pending: increment counter, confirm at threshold
        - If different: reset counter, start new pending
        - If same as confirmed: update last_seen
        """
        detected_limit = detection.speed_limit
        detected_time_cond = detection.time_condition

        # Check if this is the same as the current confirmed speed limit
        if state.confirmed_speed_limit is not None:
            if state.confirmed_speed_limit.speed_limit == detected_limit:
                # Same as confirmed - update last_seen
                state.confirmed_speed_limit.update_last_seen()
                self._pending_speed_limit = None
                self._pending_count = 0
                state.pending_detection = None
                state.pending_count = 0
                self._memory.update_state(state)
                logger.debug(f"Confirmed speed limit {detected_limit} still visible")
                return state

        # Check if this is the same as the pending speed limit
        if self._pending_speed_limit == detected_limit:
            # Same as pending - increment counter
            self._pending_count += 1
            logger.debug(
                f"Speed limit {detected_limit} detected ({self._pending_count}/{self.config.confirmation_frames})"
            )

            if self._pending_count >= self.config.confirmation_frames:
                # Confirmed! Create new confirmed speed limit
                state.confirmed_speed_limit = ConfirmedSpeedLimit(
                    speed_limit=detected_limit,
                    time_condition=detected_time_cond,
                    confirmed_at=datetime.now(),
                    last_seen_at=datetime.now(),
                    detection_count=self._pending_count,
                )
                state.status = DetectionStatus.CONFIRMED
                state.pending_detection = None
                state.pending_count = 0

                # Reset pending
                self._pending_speed_limit = None
                self._pending_time_condition = None
                self._pending_count = 0

                logger.info(
                    f"Speed limit {detected_limit} CONFIRMED"
                    + (f" (time condition: {detected_time_cond})" if detected_time_cond else "")
                )
            else:
                # Still pending
                state.status = DetectionStatus.DETECTING
                state.pending_detection = detection
                state.pending_count = self._pending_count
        else:
            # Different speed limit detected - reset and start new pending
            self._pending_speed_limit = detected_limit
            self._pending_time_condition = detected_time_cond
            self._pending_count = 1

            state.status = DetectionStatus.DETECTING
            state.pending_detection = detection
            state.pending_count = 1

            logger.debug(
                f"New speed limit {detected_limit} detected (1/{self.config.confirmation_frames})"
            )

        self._memory.update_state(state)
        return state

    def get_current_state(self) -> CurrentState:
        """Get the current state."""
        return self._memory.get_state()

    def get_effective_speed_limit(self) -> Optional[int]:
        """Get the effective speed limit (considering time conditions)."""
        return self._memory.get_speed_limit()

    def reset(self) -> None:
        """Reset the state manager to initial state."""
        self._pending_speed_limit = None
        self._pending_time_condition = None
        self._pending_count = 0
        self._memory.reset()


def create_detection(
    speed_limit: int,
    confidence: float = 0.9,
    bbox: Optional[BoundingBox] = None,
    time_condition: Optional[TimeCondition] = None,
) -> SpeedLimitDetection:
    """Helper function to create a SpeedLimitDetection.

    Args:
        speed_limit: The detected speed limit.
        confidence: Detection confidence.
        bbox: Bounding box (optional, defaults to dummy box).
        time_condition: Time-based condition (optional).

    Returns:
        SpeedLimitDetection instance.
    """
    if bbox is None:
        bbox = BoundingBox(x1=0, y1=0, x2=100, y2=100)

    return SpeedLimitDetection(
        speed_limit=speed_limit,
        confidence=confidence,
        bbox=bbox,
        time_condition=time_condition,
    )
