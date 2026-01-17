"""Tests for api/routes/websocket.py - WebSocket endpoints."""

import pytest
from fastapi.testclient import TestClient

from src.speed_detector.api.server import create_app
from src.speed_detector.shared.memory import get_shared_memory
from src.speed_detector.shared.state import (
    CurrentState,
    ConfirmedSpeedLimit,
    DetectionStatus,
)


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    app = create_app()
    return TestClient(app)


class TestWebSocketSpeed:
    """Tests for /ws/speed WebSocket endpoint."""

    def test_websocket_connection(self, client):
        """Test WebSocket connection and initial message."""
        with client.websocket_connect("/ws/speed") as websocket:
            # Should receive initial state
            data = websocket.receive_json()

            assert data["type"] == "speed_update"
            assert "data" in data
            assert "status" in data["data"]
            assert "last_updated" in data["data"]

    def test_websocket_receives_state(self, client):
        """Test WebSocket receives current state."""
        # Set up state
        memory = get_shared_memory()
        state = CurrentState(
            status=DetectionStatus.CONFIRMED,
            confirmed_speed_limit=ConfirmedSpeedLimit(speed_limit=50),
        )
        memory.update_state(state)

        with client.websocket_connect("/ws/speed") as websocket:
            data = websocket.receive_json()

            assert data["type"] == "speed_update"
            assert data["data"]["status"] == "confirmed"
            assert data["data"]["speed_limit"] == 50

    def test_websocket_message_format(self, client):
        """Test WebSocket message format matches schema."""
        with client.websocket_connect("/ws/speed") as websocket:
            data = websocket.receive_json()

            # Check message structure
            assert "type" in data
            assert "data" in data

            # Check data structure
            inner_data = data["data"]
            assert "status" in inner_data
            assert "speed_limit" in inner_data
            assert "effective_speed_limit" in inner_data
            assert "time_condition" in inner_data
            assert "last_updated" in inner_data
