"""
`auth_sessions` table: one row per signed-in browser.

Logging in creates a row and gives the browser a random token; every request then
sends that token, and the row says which user it belongs to. Logging out deletes the row.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utc_now

if TYPE_CHECKING:
    from app.models.user import User


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    # CASCADE: deleting a user signs them out everywhere.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # INTERVIEW: only the SHA-256 of the token is stored, never the token itself. Someone
    # who reads the database still can't sign in, because they can't turn the hash back
    # into the token the browser has to send. (Unique, so lookups use an index.)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship()
