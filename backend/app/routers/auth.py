"""
Account routes: POST /api/auth/signup, /api/auth/login and /api/auth/logout.

Thin, like every router: validated input in, one service call, a response schema out.
"""

from fastapi import APIRouter, status

from app.deps import BearerToken, DbSession, LoginAttempts
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest
from app.schemas.errors import CONFLICT, TOO_MANY_REQUESTS, UNAUTHORIZED
from app.schemas.user import UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={**CONFLICT},
)
def sign_up(db: DbSession, request: SignupRequest) -> AuthResponse:
    """Create an account and sign it in. 409 if the email already has an account."""
    user, token = auth_service.sign_up(db, request)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse, responses={**UNAUTHORIZED, **TOO_MANY_REQUESTS})
def log_in(db: DbSession, attempts: LoginAttempts, request: LoginRequest) -> AuthResponse:
    """Sign in with email and password. 401 if either is wrong (the same message for both),
    429 after too many wrong passwords for this account."""
    user, token = auth_service.log_in(db, request, attempts=attempts)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def log_out(db: DbSession, token: BearerToken) -> None:
    """End this browser's session. Always 204, even if it had already ended."""
    if token is not None:
        auth_service.log_out(db, token)
