"""Speed limit API routes."""

from fastapi import APIRouter
from datetime import datetime

from ..schemas import SpeedLimitResponse, TimeConditionResponse
from ...shared.memory import get_shared_memory

router = APIRouter(prefix="/api/v1", tags=["speed"])


@router.get("/current", response_model=SpeedLimitResponse)
async def get_current_speed_limit() -> SpeedLimitResponse:
    """Get the current detected speed limit.

    Returns the current confirmed speed limit if available,
    or indicates that no speed limit has been detected.

    Response fields:
    - status: 'no_detection', 'detecting', or 'confirmed'
    - speed_limit: The confirmed speed limit value (null if not confirmed)
    - effective_speed_limit: The speed limit considering time conditions
    - time_condition: Time-based restriction if present
    - confirmed_at: When the speed limit was first confirmed
    - last_seen_at: When the speed limit was last visible
    - last_updated: When the state was last updated
    """
    memory = get_shared_memory()
    state_dict = memory.get_state_dict()

    # Build response
    time_condition = None
    if "time_condition" in state_dict:
        tc = state_dict["time_condition"]
        time_condition = TimeConditionResponse(
            range=tc["range"],
            is_active=tc["is_active"],
        )

    return SpeedLimitResponse(
        status=state_dict["status"],
        speed_limit=state_dict.get("speed_limit"),
        effective_speed_limit=state_dict.get("effective_speed_limit"),
        time_condition=time_condition,
        confirmed_at=state_dict.get("confirmed_at"),
        last_seen_at=state_dict.get("last_seen_at"),
        last_updated=state_dict["last_updated"],
    )


@router.get("/effective", response_model=dict)
async def get_effective_speed_limit() -> dict:
    """Get just the effective speed limit value.

    This is a simplified endpoint that returns only the
    currently effective speed limit (considering time conditions).

    Returns:
        {"speed_limit": int | null}
    """
    memory = get_shared_memory()
    speed_limit = memory.get_speed_limit()

    return {"speed_limit": speed_limit}
