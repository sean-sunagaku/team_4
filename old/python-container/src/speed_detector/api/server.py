"""FastAPI application server."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.speed import router as speed_router
from .routes.websocket import router as websocket_router
from .schemas import HealthResponse
from .. import __version__
from ..config import get_config

logger = logging.getLogger(__name__)

# Track pipeline status
_pipeline_running = False


def set_pipeline_running(running: bool) -> None:
    """Set the pipeline running status."""
    global _pipeline_running
    _pipeline_running = running


def is_pipeline_running() -> bool:
    """Check if the pipeline is running."""
    return _pipeline_running


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan handler."""
    logger.info("Starting Speed Limit Detector API")
    yield
    logger.info("Shutting down Speed Limit Detector API")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    config = get_config()

    app = FastAPI(
        title="Speed Limit Detector API",
        description="Real-time Japanese speed limit sign detection API",
        version=__version__,
        lifespan=lifespan,
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(speed_router)
    app.include_router(websocket_router)

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    async def health_check() -> HealthResponse:
        """Health check endpoint.

        Returns:
            Health status including pipeline running state.
        """
        return HealthResponse(
            status="healthy",
            version=__version__,
            pipeline_running=is_pipeline_running(),
        )

    @app.get("/", tags=["root"])
    async def root() -> dict:
        """Root endpoint with API information."""
        return {
            "name": "Speed Limit Detector API",
            "version": __version__,
            "docs": "/docs",
            "endpoints": {
                "health": "/health",
                "current": "/api/v1/current",
                "effective": "/api/v1/effective",
                "websocket": "/ws/speed",
            },
        }

    return app


# Create the default app instance
app = create_app()
