"""Tests for shared/state.py - Data structure definitions."""

import pytest
from datetime import time, datetime

from src.speed_detector.shared.state import (
    BoundingBox,
    TimeCondition,
    SpeedLimitDetection,
    ConfirmedSpeedLimit,
    CurrentState,
    DetectionStatus,
)


class TestBoundingBox:
    """Tests for BoundingBox dataclass."""

    def test_creation(self):
        """Test bounding box creation."""
        bbox = BoundingBox(x1=10.0, y1=20.0, x2=110.0, y2=120.0)
        assert bbox.x1 == 10.0
        assert bbox.y1 == 20.0
        assert bbox.x2 == 110.0
        assert bbox.y2 == 120.0

    def test_width_height(self):
        """Test width and height properties."""
        bbox = BoundingBox(x1=10.0, y1=20.0, x2=110.0, y2=170.0)
        assert bbox.width == 100.0
        assert bbox.height == 150.0

    def test_center(self):
        """Test center property."""
        bbox = BoundingBox(x1=0.0, y1=0.0, x2=100.0, y2=100.0)
        center = bbox.center
        assert center == (50.0, 50.0)


class TestTimeCondition:
    """Tests for TimeCondition dataclass."""

    def test_creation(self):
        """Test time condition creation."""
        tc = TimeCondition(start_hour=7, end_hour=19)
        assert tc.start_hour == 7
        assert tc.end_hour == 19
        assert tc.start_minute == 0
        assert tc.end_minute == 0

    def test_is_active_within_range(self):
        """Test is_active returns True within time range."""
        tc = TimeCondition(start_hour=7, end_hour=19)
        assert tc.is_active(time(10, 0)) is True
        assert tc.is_active(time(7, 0)) is True
        assert tc.is_active(time(19, 0)) is True

    def test_is_active_outside_range(self):
        """Test is_active returns False outside time range."""
        tc = TimeCondition(start_hour=7, end_hour=19)
        assert tc.is_active(time(6, 59)) is False
        assert tc.is_active(time(19, 1)) is False
        assert tc.is_active(time(23, 0)) is False
        assert tc.is_active(time(3, 0)) is False

    def test_is_active_overnight(self):
        """Test overnight time condition (e.g., 22:00-6:00)."""
        tc = TimeCondition(start_hour=22, end_hour=6)
        assert tc.is_active(time(23, 0)) is True
        assert tc.is_active(time(1, 0)) is True
        assert tc.is_active(time(6, 0)) is True
        assert tc.is_active(time(12, 0)) is False

    def test_from_string_simple(self):
        """Test parsing simple time string like '7-19'."""
        tc = TimeCondition.from_string("7-19")
        assert tc is not None
        assert tc.start_hour == 7
        assert tc.end_hour == 19
        assert tc.start_minute == 0
        assert tc.end_minute == 0

    def test_from_string_with_minutes(self):
        """Test parsing time string with minutes like '7:30-19:00'."""
        tc = TimeCondition.from_string("7:30-19:00")
        assert tc is not None
        assert tc.start_hour == 7
        assert tc.start_minute == 30
        assert tc.end_hour == 19
        assert tc.end_minute == 0

    def test_from_string_invalid(self):
        """Test parsing invalid time strings."""
        assert TimeCondition.from_string("invalid") is None
        assert TimeCondition.from_string("25-19") is None
        assert TimeCondition.from_string("7-25") is None

    def test_str_simple(self):
        """Test string representation without minutes."""
        tc = TimeCondition(start_hour=7, end_hour=19)
        assert str(tc) == "7-19"

    def test_str_with_minutes(self):
        """Test string representation with minutes."""
        tc = TimeCondition(start_hour=7, end_hour=19, start_minute=30, end_minute=45)
        assert str(tc) == "07:30-19:45"


class TestSpeedLimitDetection:
    """Tests for SpeedLimitDetection dataclass."""

    def test_creation(self, sample_bbox):
        """Test detection creation."""
        detection = SpeedLimitDetection(
            speed_limit=40,
            confidence=0.9,
            bbox=sample_bbox,
        )
        assert detection.speed_limit == 40
        assert detection.confidence == 0.9
        assert detection.bbox == sample_bbox
        assert detection.time_condition is None

    def test_is_currently_active_no_condition(self, sample_bbox):
        """Test is_currently_active without time condition."""
        detection = SpeedLimitDetection(
            speed_limit=40,
            confidence=0.9,
            bbox=sample_bbox,
        )
        assert detection.is_currently_active() is True

    def test_is_currently_active_with_condition(self, sample_bbox):
        """Test is_currently_active with time condition."""
        detection = SpeedLimitDetection(
            speed_limit=30,
            confidence=0.9,
            bbox=sample_bbox,
            time_condition=TimeCondition(start_hour=7, end_hour=19),
        )
        # Result depends on current time - just ensure it doesn't crash
        result = detection.is_currently_active()
        assert isinstance(result, bool)


class TestConfirmedSpeedLimit:
    """Tests for ConfirmedSpeedLimit dataclass."""

    def test_creation(self):
        """Test confirmed speed limit creation."""
        confirmed = ConfirmedSpeedLimit(speed_limit=50)
        assert confirmed.speed_limit == 50
        assert confirmed.time_condition is None
        assert confirmed.detection_count == 0

    def test_update_last_seen(self):
        """Test update_last_seen increments count."""
        confirmed = ConfirmedSpeedLimit(speed_limit=50)
        initial_count = confirmed.detection_count

        confirmed.update_last_seen()
        assert confirmed.detection_count == initial_count + 1


class TestCurrentState:
    """Tests for CurrentState dataclass."""

    def test_initial_state(self):
        """Test initial state is NO_DETECTION."""
        state = CurrentState()
        assert state.status == DetectionStatus.NO_DETECTION
        assert state.confirmed_speed_limit is None
        assert state.pending_detection is None
        assert state.pending_count == 0

    def test_get_effective_speed_limit_none(self):
        """Test get_effective_speed_limit returns None when no detection."""
        state = CurrentState()
        assert state.get_effective_speed_limit() is None

    def test_get_effective_speed_limit_confirmed(self):
        """Test get_effective_speed_limit with confirmed limit."""
        state = CurrentState(
            status=DetectionStatus.CONFIRMED,
            confirmed_speed_limit=ConfirmedSpeedLimit(speed_limit=40),
        )
        assert state.get_effective_speed_limit() == 40

    def test_to_dict(self):
        """Test to_dict method."""
        state = CurrentState()
        result = state.to_dict()

        assert "status" in result
        assert "last_updated" in result
        assert result["status"] == "no_detection"
