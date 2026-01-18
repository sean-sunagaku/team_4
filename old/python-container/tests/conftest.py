"""Pytest configuration and shared fixtures."""

import pytest
from datetime import time

from src.speed_detector.config import Config, set_config
from src.speed_detector.shared.memory import SharedMemory
from src.speed_detector.shared.state import (
    BoundingBox,
    SpeedLimitDetection,
    TimeCondition,
)


@pytest.fixture(autouse=True)
def reset_shared_memory():
    """Reset shared memory before each test."""
    SharedMemory.reset_instance()
    yield
    SharedMemory.reset_instance()


@pytest.fixture
def default_config():
    """Create a default test configuration."""
    config = Config()
    set_config(config)
    return config


@pytest.fixture
def sample_bbox():
    """Create a sample bounding box."""
    return BoundingBox(x1=100.0, y1=100.0, x2=200.0, y2=200.0)


@pytest.fixture
def sample_detection(sample_bbox):
    """Create a sample speed limit detection."""
    return SpeedLimitDetection(
        speed_limit=40,
        confidence=0.9,
        bbox=sample_bbox,
    )


@pytest.fixture
def sample_detection_with_time_condition(sample_bbox):
    """Create a sample detection with time condition."""
    return SpeedLimitDetection(
        speed_limit=30,
        confidence=0.85,
        bbox=sample_bbox,
        time_condition=TimeCondition(start_hour=7, end_hour=19),
    )


@pytest.fixture
def morning_time():
    """Return a morning time (within 7-19)."""
    return time(10, 0)


@pytest.fixture
def night_time():
    """Return a night time (outside 7-19)."""
    return time(22, 0)
