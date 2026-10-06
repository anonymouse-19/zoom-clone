"""
Response shape for users (GET /api/me, and the host field inside meetings).
"""

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    # from_attributes=True lets Pydantic read fields straight off a SQLAlchemy object:
    # UserOut.model_validate(user).
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    avatar_color: str
    timezone: str
    personal_meeting_id: str


class HostOut(BaseModel):
    """The little bit of a user that meeting lists need."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_color: str
