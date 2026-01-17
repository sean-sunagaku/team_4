"""Shared components for inter-process communication."""

from .state import SpeedLimitDetection, ConfirmedSpeedLimit, DetectionStatus
from .memory import SharedMemory

__all__ = ["SpeedLimitDetection", "ConfirmedSpeedLimit", "DetectionStatus", "SharedMemory"]
