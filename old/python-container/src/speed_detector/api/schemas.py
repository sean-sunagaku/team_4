"""Pydantic schemas for API responses."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TimeConditionResponse(BaseModel):
    """Time condition for speed limit."""

    range: str = Field(..., description="Time range string (e.g., '7-19')")
    is_active: bool = Field(..., description="Whether the condition is currently active")


class SpeedLimitResponse(BaseModel):
    """Response for current speed limit endpoint."""

    status: str = Field(
        ...,
        description="Detection status: 'no_detection', 'detecting', or 'confirmed'",
    )
    speed_limit: Optional[int] = Field(
        None,
        description="The confirmed speed limit value (e.g., 40, 50, 60)",
    )
    effective_speed_limit: Optional[int] = Field(
        None,
        description="The effective speed limit considering time conditions",
    )
    time_condition: Optional[TimeConditionResponse] = Field(
        None,
        description="Time-based condition if present",
    )
    confirmed_at: Optional[datetime] = Field(
        None,
        description="When the speed limit was first confirmed",
    )
    last_seen_at: Optional[datetime] = Field(
        None,
        description="When the speed limit was last visible",
    )
    last_updated: datetime = Field(
        ...,
        description="When the state was last updated",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "confirmed",
                    "speed_limit": 40,
                    "effective_speed_limit": 40,
                    "time_condition": None,
                    "confirmed_at": "2024-01-15T10:30:00",
                    "last_seen_at": "2024-01-15T10:35:00",
                    "last_updated": "2024-01-15T10:35:00",
                },
                {
                    "status": "confirmed",
                    "speed_limit": 30,
                    "effective_speed_limit": 30,
                    "time_condition": {
                        "range": "7-19",
                        "is_active": True,
                    },
                    "confirmed_at": "2024-01-15T10:30:00",
                    "last_seen_at": "2024-01-15T10:35:00",
                    "last_updated": "2024-01-15T10:35:00",
                },
                {
                    "status": "no_detection",
                    "speed_limit": None,
                    "effective_speed_limit": None,
                    "time_condition": None,
                    "confirmed_at": None,
                    "last_seen_at": None,
                    "last_updated": "2024-01-15T10:35:00",
                },
            ]
        }
    )


class HealthResponse(BaseModel):
    """Response for health check endpoint."""

    status: str = Field(..., description="Health status")
    version: str = Field(..., description="Application version")
    pipeline_running: bool = Field(..., description="Whether the video pipeline is running")


class WebSocketMessage(BaseModel):
    """Message format for WebSocket communication."""

    type: str = Field(..., description="Message type: 'speed_update' or 'error'")
    data: SpeedLimitResponse = Field(..., description="Speed limit data")


class ErrorResponse(BaseModel):
    """Error response format."""

    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
