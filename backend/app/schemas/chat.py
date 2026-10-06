"""
Response shape for chat messages (chat history, and the transcript in the summary).
"""

from datetime import datetime
from typing import Self

from pydantic import BaseModel

from app.models import ChatMessage


class ChatMessageOut(BaseModel):
    id: int
    sender_participant_id: int
    sender_name: str
    # None = sent to everyone.
    recipient_participant_id: int | None
    recipient_name: str | None
    body: str
    sent_at: datetime

    @classmethod
    def from_message(cls, message: ChatMessage) -> Self:
        recipient = message.recipient
        return cls(
            id=message.id,
            sender_participant_id=message.sender_participant_id,
            sender_name=message.sender.display_name,
            recipient_participant_id=message.recipient_participant_id,
            recipient_name=recipient.display_name if recipient else None,
            body=message.body,
            sent_at=message.sent_at,
        )
