"""WebSocket routes for real-time speed limit updates."""

import asyncio
import logging
from typing import Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..schemas import SpeedLimitResponse, TimeConditionResponse
from ...shared.memory import get_shared_memory
from ...config import get_config

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._last_state: dict = {}

    async def connect(self, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict) -> None:
        """Broadcast a message to all connected clients."""
        disconnected = set()

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.add(connection)

        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.active_connections)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/speed")
async def websocket_speed_updates(websocket: WebSocket):
    """WebSocket endpoint for real-time speed limit updates.

    Sends updates when the speed limit state changes.

    Message format:
    {
        "type": "speed_update",
        "data": {
            "status": "confirmed",
            "speed_limit": 40,
            "effective_speed_limit": 40,
            ...
        }
    }
    """
    await manager.connect(websocket)

    config = get_config()
    memory = get_shared_memory()
    last_state_dict = None

    try:
        # Send initial state
        initial_state = memory.get_state_dict()
        await websocket.send_json({
            "type": "speed_update",
            "data": _format_state(initial_state),
        })
        last_state_dict = initial_state

        # Keep connection alive and send updates
        while True:
            # Check for state changes
            current_state = memory.get_state_dict()

            # Only send if state has changed (ignoring last_updated)
            if _has_significant_change(last_state_dict, current_state):
                await websocket.send_json({
                    "type": "speed_update",
                    "data": _format_state(current_state),
                })
                last_state_dict = current_state

            # Wait before next check
            await asyncio.sleep(config.api.websocket_broadcast_interval)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


def _format_state(state_dict: dict) -> dict:
    """Format state dictionary for WebSocket response."""
    time_condition = None
    if "time_condition" in state_dict:
        tc = state_dict["time_condition"]
        time_condition = {
            "range": tc["range"],
            "is_active": tc["is_active"],
        }

    return {
        "status": state_dict["status"],
        "speed_limit": state_dict.get("speed_limit"),
        "effective_speed_limit": state_dict.get("effective_speed_limit"),
        "time_condition": time_condition,
        "confirmed_at": state_dict.get("confirmed_at"),
        "last_seen_at": state_dict.get("last_seen_at"),
        "last_updated": state_dict["last_updated"],
    }


def _has_significant_change(old_state: dict, new_state: dict) -> bool:
    """Check if there's a significant change between states.

    Ignores last_updated to avoid sending unnecessary updates.
    """
    if old_state is None:
        return True

    # Compare relevant fields
    keys = ["status", "speed_limit", "effective_speed_limit", "time_condition", "confirmed_at"]

    for key in keys:
        if old_state.get(key) != new_state.get(key):
            return True

    return False


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager."""
    return manager
