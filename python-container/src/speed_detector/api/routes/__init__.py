"""API route handlers."""

from .speed import router as speed_router
from .websocket import router as websocket_router
from .frames import router as frames_router

__all__ = ["speed_router", "websocket_router", "frames_router"]
