"""Tests for api/routes/speed.py - Speed limit API endpoints."""

import pytest
from fastapi.testclient import TestClient

from src.speed_detector.api.server import create_app
from src.speed_detector.shared.memory import SharedMemory, get_shared_memory
from src.speed_detector.shared.state import (
    CurrentState,
    ConfirmedSpeedLimit,
    DetectionStatus,
    TimeCondition,
)


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    app = create_app()
    return TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check(self, client):
        """Test health check returns healthy status."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "pipeline_running" in data


class TestRootEndpoint:
    """Tests for / endpoint."""

    def test_root_returns_api_info(self, client):
        """Test root endpoint returns API information."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "endpoints" in data


class TestCurrentSpeedEndpoint:
    """Tests for /api/v1/current endpoint."""

    def test_current_no_detection(self, client):
        """Test /current with no detection."""
        response = client.get("/api/v1/current")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "no_detection"
        assert data["speed_limit"] is None
        assert data["effective_speed_limit"] is None
        assert "last_updated" in data

    def test_current_with_confirmed_speed(self, client):
        """Test /current with confirmed speed limit."""
        # Set up state with confirmed speed limit
        memory = get_shared_memory()
        state = CurrentState(
            status=DetectionStatus.CONFIRMED,
            confirmed_speed_limit=ConfirmedSpeedLimit(speed_limit=40),
        )
        memory.update_state(state)

        response = client.get("/api/v1/current")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "confirmed"
        assert data["speed_limit"] == 40
        assert data["effective_speed_limit"] == 40

    def test_current_with_time_condition(self, client):
        """Test /current with time-based speed limit."""
        memory = get_shared_memory()
        state = CurrentState(
            status=DetectionStatus.CONFIRMED,
            confirmed_speed_limit=ConfirmedSpeedLimit(
                speed_limit=30,
                time_condition=TimeCondition(start_hour=7, end_hour=19),
            ),
        )
        memory.update_state(state)

        response = client.get("/api/v1/current")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "confirmed"
        assert data["speed_limit"] == 30
        assert data["time_condition"] is not None
        assert data["time_condition"]["range"] == "7-19"


class TestEffectiveSpeedEndpoint:
    """Tests for /api/v1/effective endpoint."""

    def test_effective_no_detection(self, client):
        """Test /effective with no detection."""
        response = client.get("/api/v1/effective")

        assert response.status_code == 200
        data = response.json()
        assert data["speed_limit"] is None

    def test_effective_with_confirmed_speed(self, client):
        """Test /effective with confirmed speed limit."""
        memory = get_shared_memory()
        state = CurrentState(
            status=DetectionStatus.CONFIRMED,
            confirmed_speed_limit=ConfirmedSpeedLimit(speed_limit=60),
        )
        memory.update_state(state)

        response = client.get("/api/v1/effective")

        assert response.status_code == 200
        data = response.json()
        assert data["speed_limit"] == 60
