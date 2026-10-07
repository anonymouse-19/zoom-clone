"""
Everything a room message handler needs, bundled: the live rooms, a way to reach the
database, and which meeting this connection belongs to.

Called by: room_handler.py (creates one per connection), meeting_features.py and
host_controls.py (every handler takes it as its first argument).
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool

from app.realtime.messages import ServerError, ServerMessage
from app.realtime.room_manager import RoomManager, RoomMember


@dataclass(frozen=True)
class RoomContext:
    room_manager: RoomManager
    session_factory: sessionmaker[Session]
    meeting_code: str

    async def in_database(self, function: Callable[..., Any], **kwargs: Any) -> Any:
        """Run a (blocking) service function in a worker thread, with its own short session.

        The WebSocket code runs on the event loop, which serves every connection. Waiting
        there on the database would freeze all meetings for that moment, so the work
        goes to a thread instead. A fresh session per call means no database transaction
        stays open for the length of a meeting (docs/DECISIONS.md D-058).
        """

        def run() -> Any:
            with self.session_factory() as db:
                return function(db, **kwargs)

        return await run_in_threadpool(run)

    async def broadcast(
        self, message: ServerMessage, *, except_participant_id: int | None = None
    ) -> None:
        await self.room_manager.broadcast(
            self.meeting_code, message, except_participant_id=except_participant_id
        )

    async def send_error(self, member: RoomMember, text: str) -> None:
        await self.room_manager.send(member, ServerError(message=text))
