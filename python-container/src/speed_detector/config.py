"""Configuration management for the speed limit detector."""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class VideoConfig:
    """Video source configuration."""

    url: str = field(default_factory=lambda: os.getenv("VIDEO_URL", ""))
    fps_limit: int = 10  # Process at most N frames per second
    reconnect_delay: float = 5.0  # Seconds to wait before reconnecting on failure


@dataclass
class DetectorConfig:
    """YOLO detector configuration."""

    model_path: str = field(
        default_factory=lambda: os.getenv("YOLO_MODEL", "yolov8n.pt")
    )
    confidence_threshold: float = 0.5
    device: str = field(default_factory=lambda: os.getenv("DEVICE", "cpu"))


@dataclass
class OCRConfig:
    """EasyOCR configuration."""

    languages: list[str] = field(default_factory=lambda: ["en"])
    gpu: bool = field(default_factory=lambda: os.getenv("OCR_GPU", "false").lower() == "true")
    allowlist: str = "0123456789"  # Only recognize digits


@dataclass
class StateConfig:
    """State management configuration."""

    confirmation_frames: int = 3  # Number of consecutive frames needed to confirm detection
    ttl_seconds: float = float("inf")  # How long to keep last detection (infinity = keep forever)


@dataclass
class APIConfig:
    """API server configuration."""

    host: str = field(default_factory=lambda: os.getenv("API_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("API_PORT", "8000")))
    websocket_broadcast_interval: float = 0.1  # Seconds between WebSocket broadcasts


@dataclass
class Config:
    """Main configuration class."""

    video: VideoConfig = field(default_factory=VideoConfig)
    detector: DetectorConfig = field(default_factory=DetectorConfig)
    ocr: OCRConfig = field(default_factory=OCRConfig)
    state: StateConfig = field(default_factory=StateConfig)
    api: APIConfig = field(default_factory=APIConfig)

    @classmethod
    def from_env(cls) -> "Config":
        """Create configuration from environment variables."""
        return cls()


# Global config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config


def set_config(config: Config) -> None:
    """Set the global configuration instance (for testing)."""
    global _config
    _config = config
