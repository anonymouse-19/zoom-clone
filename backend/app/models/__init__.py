"""
Imports every model so that `import app.models` registers all tables on Base.metadata.

Alembic and the tests rely on this: a model file that is never imported is invisible to
them, and its table would silently be missing from migrations.
"""

from app.models.auth_session import AuthSession
from app.models.base import Base
from app.models.chat_message import ChatMessage
from app.models.meeting import Meeting
from app.models.meeting_event import MeetingEvent
from app.models.meeting_invitee import MeetingInvitee
from app.models.meeting_settings import MeetingSettings
from app.models.participant import Participant
from app.models.user import User

__all__ = [
    "AuthSession",
    "Base",
    "ChatMessage",
    "Meeting",
    "MeetingEvent",
    "MeetingInvitee",
    "MeetingSettings",
    "Participant",
    "User",
]
