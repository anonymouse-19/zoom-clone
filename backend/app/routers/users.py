"""
User routes: GET /api/me.
"""

from fastapi import APIRouter

from app.deps import CurrentUser
from app.schemas.errors import UNAUTHORIZED
from app.schemas.user import UserOut

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut, responses={**UNAUTHORIZED})
def get_me(user: CurrentUser) -> UserOut:
    """The signed-in user. 401 if the request has no valid session token."""
    return UserOut.model_validate(user)
