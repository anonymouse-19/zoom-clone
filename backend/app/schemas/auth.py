"""
Request and response shapes for signing up, logging in and logging out (/api/auth/...).
"""

from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.models.user import DEFAULT_TIMEZONE
from app.schemas.meeting import EmailAddress, TimezoneName
from app.schemas.user import UserOut

MIN_PASSWORD_LENGTH = 8
# An upper limit stops someone sending a 10 MB "password" to make the server hash it.
MAX_PASSWORD_LENGTH = 128
MAX_NAME_LENGTH = 100

Password = Annotated[
    str, StringConstraints(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
]
PersonName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NAME_LENGTH)
]


class SignupRequest(BaseModel):
    name: PersonName
    email: EmailAddress
    password: Password
    # The browser's own timezone, so meeting times show in local time from the start.
    timezone: TimezoneName = DEFAULT_TIMEZONE


class LoginRequest(BaseModel):
    email: EmailAddress
    # Only an upper limit (no password can be longer), so a short wrong password still
    # gets "incorrect" rather than a hint about the rules.
    password: Annotated[str, StringConstraints(max_length=MAX_PASSWORD_LENGTH)]


class AuthResponse(BaseModel):
    """What signing up or logging in returns: the session token, and who you are.

    The browser keeps the token and sends it as `Authorization: Bearer <token>`.
    """

    token: str
    user: UserOut
