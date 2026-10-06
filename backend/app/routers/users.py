"""
User routes: GET /api/me.
"""

from fastapi import APIRouter

from app.deps import CurrentUser
from app.schemas.errors import UNAVAILABLE
from app.schemas.user import UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut, responses={**UNAVAILABLE})
def get_me(user: CurrentUser) -> UserOut:
    """The logged-in user (always the seeded default user; see deps.get_current_user)."""
    return UserOut.model_validate(user)
