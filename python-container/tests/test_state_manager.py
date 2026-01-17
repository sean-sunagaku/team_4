"""Tests for pipeline/state_manager.py - 3-frame confirmation logic."""

import pytest

from src.speed_detector.config import Config, StateConfig, set_config
from src.speed_detector.shared.state import (
    DetectionStatus,
    TimeCondition,
)
from src.speed_detector.pipeline.state_manager import (
    StateManager,
    create_detection,
)


class TestStateManager:
    """Tests for StateManager class."""

    @pytest.fixture
    def state_manager(self):
        """Create a StateManager for testing."""
        # Set config with 3-frame confirmation
        config = Config()
        config.state = StateConfig(confirmation_frames=3)
        set_config(config)

        return StateManager()

    def test_initial_state(self, state_manager):
        """Test initial state is NO_DETECTION."""
        state = state_manager.get_current_state()
        assert state.status == DetectionStatus.NO_DETECTION
        assert state.confirmed_speed_limit is None

    def test_single_detection_not_confirmed(self, state_manager):
        """Test that single detection doesn't confirm."""
        detection = create_detection(speed_limit=40)
        state = state_manager.update(detection)

        assert state.status == DetectionStatus.DETECTING
        assert state.pending_count == 1
        assert state.confirmed_speed_limit is None

    def test_two_detections_not_confirmed(self, state_manager):
        """Test that two consecutive detections don't confirm."""
        detection = create_detection(speed_limit=40)

        state_manager.update(detection)
        state = state_manager.update(detection)

        assert state.status == DetectionStatus.DETECTING
        assert state.pending_count == 2
        assert state.confirmed_speed_limit is None

    def test_three_detections_confirms(self, state_manager):
        """Test that three consecutive detections confirm."""
        detection = create_detection(speed_limit=40)

        state_manager.update(detection)
        state_manager.update(detection)
        state = state_manager.update(detection)

        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit is not None
        assert state.confirmed_speed_limit.speed_limit == 40

    def test_different_detection_resets_counter(self, state_manager):
        """Test that different detection resets the counter."""
        detection_40 = create_detection(speed_limit=40)
        detection_50 = create_detection(speed_limit=50)

        # Two 40s
        state_manager.update(detection_40)
        state_manager.update(detection_40)

        # Then a 50 - should reset
        state = state_manager.update(detection_50)

        assert state.status == DetectionStatus.DETECTING
        assert state.pending_count == 1

    def test_no_detection_keeps_confirmed(self, state_manager):
        """Test that no detection keeps the confirmed value."""
        detection = create_detection(speed_limit=40)

        # Confirm 40
        state_manager.update(detection)
        state_manager.update(detection)
        state_manager.update(detection)

        # No detection
        state = state_manager.update(None)

        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit is not None
        assert state.confirmed_speed_limit.speed_limit == 40

    def test_confirmed_persists_forever(self, state_manager):
        """Test that confirmed value persists through many empty frames."""
        detection = create_detection(speed_limit=40)

        # Confirm 40
        state_manager.update(detection)
        state_manager.update(detection)
        state_manager.update(detection)

        # Many frames with no detection
        for _ in range(100):
            state = state_manager.update(None)

        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit.speed_limit == 40

    def test_new_sign_overwrites_old(self, state_manager):
        """Test that new confirmed sign overwrites old one."""
        detection_40 = create_detection(speed_limit=40)
        detection_60 = create_detection(speed_limit=60)

        # Confirm 40
        state_manager.update(detection_40)
        state_manager.update(detection_40)
        state_manager.update(detection_40)

        # Confirm 60
        state_manager.update(detection_60)
        state_manager.update(detection_60)
        state = state_manager.update(detection_60)

        assert state.status == DetectionStatus.CONFIRMED
        assert state.confirmed_speed_limit.speed_limit == 60

    def test_same_as_confirmed_updates_last_seen(self, state_manager):
        """Test that detecting same value as confirmed updates last_seen."""
        detection = create_detection(speed_limit=40)

        # Confirm 40
        state_manager.update(detection)
        state_manager.update(detection)
        state_manager.update(detection)

        initial_count = state_manager.get_current_state().confirmed_speed_limit.detection_count

        # Continue seeing 40
        state = state_manager.update(detection)

        assert state.confirmed_speed_limit.detection_count > initial_count

    def test_time_condition_preserved(self, state_manager):
        """Test that time condition is preserved through confirmation."""
        detection = create_detection(
            speed_limit=30,
            time_condition=TimeCondition(start_hour=7, end_hour=19),
        )

        # Confirm
        state_manager.update(detection)
        state_manager.update(detection)
        state = state_manager.update(detection)

        assert state.confirmed_speed_limit.time_condition is not None
        assert state.confirmed_speed_limit.time_condition.start_hour == 7
        assert state.confirmed_speed_limit.time_condition.end_hour == 19

    def test_get_effective_speed_limit(self, state_manager):
        """Test get_effective_speed_limit method."""
        detection = create_detection(speed_limit=50)

        # Before confirmation
        assert state_manager.get_effective_speed_limit() is None

        # After confirmation
        state_manager.update(detection)
        state_manager.update(detection)
        state_manager.update(detection)

        assert state_manager.get_effective_speed_limit() == 50

    def test_reset(self, state_manager):
        """Test reset clears all state."""
        detection = create_detection(speed_limit=40)

        # Confirm
        state_manager.update(detection)
        state_manager.update(detection)
        state_manager.update(detection)

        # Reset
        state_manager.reset()

        state = state_manager.get_current_state()
        assert state.status == DetectionStatus.NO_DETECTION
        assert state.confirmed_speed_limit is None


class TestCreateDetection:
    """Tests for create_detection helper function."""

    def test_create_basic_detection(self):
        """Test creating basic detection."""
        detection = create_detection(speed_limit=40)

        assert detection.speed_limit == 40
        assert detection.confidence == 0.9
        assert detection.bbox is not None

    def test_create_detection_with_time_condition(self):
        """Test creating detection with time condition."""
        tc = TimeCondition(start_hour=7, end_hour=19)
        detection = create_detection(speed_limit=30, time_condition=tc)

        assert detection.speed_limit == 30
        assert detection.time_condition == tc

    def test_create_detection_with_confidence(self):
        """Test creating detection with custom confidence."""
        detection = create_detection(speed_limit=40, confidence=0.75)

        assert detection.confidence == 0.75
