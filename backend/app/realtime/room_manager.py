"""
Who is connected to which meeting right now, and how to send them messages.

One RoomManager lives on the app (`app.state.room_manager`, created in main.py). It holds,
in memory, a Room per live meeting: the admitted members and the waiting room (each
member is a participant id plus that browser's WebSocket and live state), the meeting's
settings, and whether it's locked. The database records *history* (who joined and left,
chat, events). This records only the present moment, which changes many times a second
and dies with the connections anyway.

Called by: the realtime/ handler modules, routers/meetings.py (ending over REST hangs up
the room) and routers/participants.py (a locked meeting refuses new joins).

INTERVIEW: no locks are needed. Every method runs on the server's single event-loop
thread, and the plain (non-async) methods can't be interrupted halfway. The cost of
keeping rooms in memory: one server process only. Running several would need a shared
message bus (e.g. Redis pub/sub) so a message reaches sockets held by another process.
"""

import asyncio
from collections.abc import Coroutine
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.models.enums import ParticipantRole, ScreenSharePermission
from app.realtime.messages import (
    CLOSE_NORMAL,
    CLOSE_REPLACED,
    RoomSettings,
    RosterEntry,
    ServerMeetingEnded,
    ServerMessage,
    WaitingEntry,
)

MODERATOR_ROLES = (ParticipantRole.HOST, ParticipantRole.CO_HOST)

# Used only until the first connection brings the meeting's real settings.
DEFAULT_SETTINGS = RoomSettings(
    mute_on_entry=False, chat_enabled=True, screen_share=ScreenSharePermission.ALL
)


@dataclass
class RoomMember:
    """One connected browser: a participant (join session) plus its socket and live state."""

    participant_id: int
    display_name: str
    role: ParticipantRole
    websocket: WebSocket
    is_waiting: bool = False
    # Off until the browser reports otherwise: it may not have a camera or permission yet.
    is_mic_on: bool = False
    is_camera_on: bool = False
    is_screen_sharing: bool = False
    hand_raised_at: datetime | None = None
    # True once it said "leave" (or ended the meeting): its departure is then recorded
    # at once, instead of after the reconnect grace period.
    has_left_on_purpose: bool = False
    # True when the server itself already handled this connection's departure: it was
    # replaced by a newer connection, or a host removed or denied it (see disconnect).
    departure_handled: bool = False

    @property
    def is_moderator(self) -> bool:
        """Hosts and co-hosts may use host controls."""
        return self.role in MODERATOR_ROLES

    def roster_entry(self) -> RosterEntry:
        return RosterEntry(
            participant_id=self.participant_id,
            display_name=self.display_name,
            role=self.role,
            is_mic_on=self.is_mic_on,
            is_camera_on=self.is_camera_on,
            is_screen_sharing=self.is_screen_sharing,
            hand_raised_at=self.hand_raised_at,
        )

    def waiting_entry(self) -> WaitingEntry:
        return WaitingEntry(participant_id=self.participant_id, display_name=self.display_name)


@dataclass
class Room:
    """One live meeting's connections and live-only state."""

    # Admitted participants, in the order they arrived (dicts keep insertion order).
    members: dict[int, RoomMember] = field(default_factory=dict)
    waiting: dict[int, RoomMember] = field(default_factory=dict)
    settings: RoomSettings = field(default_factory=DEFAULT_SETTINGS.model_copy)
    is_locked: bool = False


class RoomManager:
    def __init__(self, reconnect_grace_seconds: float) -> None:
        # How long a dropped connection keeps its seat before it counts as having left.
        self.reconnect_grace_seconds = reconnect_grace_seconds
        self._rooms: dict[str, Room] = {}
        # Delayed jobs (see schedule). Kept here so they aren't garbage-collected mid-wait.
        self._background_tasks: set[asyncio.Task[None]] = set()

    # --- who is here ----------------------------------------------------------

    def add_member(self, meeting_code: str, member: RoomMember) -> None:
        member.is_waiting = False
        self._room(meeting_code).members[member.participant_id] = member

    def add_waiting(self, meeting_code: str, member: RoomMember) -> None:
        member.is_waiting = True
        self._room(meeting_code).waiting[member.participant_id] = member

    def take_waiting(self, meeting_code: str, participant_id: int) -> RoomMember | None:
        """Remove someone from the waiting room and return them (None if not there)."""
        room = self._rooms.get(meeting_code)
        if room is None:
            return None
        return room.waiting.pop(participant_id, None)

    def remove(self, meeting_code: str, member: RoomMember) -> None:
        """Forget this member (in the room or waiting). Safe to call twice, or after the
        room closed. Only removes this exact connection, never a newer one with the same id."""
        room = self._rooms.get(meeting_code)
        if room is None:
            return
        if room.members.get(member.participant_id) is member:
            del room.members[member.participant_id]
        if room.waiting.get(member.participant_id) is member:
            del room.waiting[member.participant_id]
        if not room.members and not room.waiting:
            del self._rooms[meeting_code]  # don't keep empty rooms around

    def connection_of(self, meeting_code: str, participant_id: int) -> RoomMember | None:
        """The current connection for this join session, in the room or waiting."""
        room = self._rooms.get(meeting_code)
        if room is None:
            return None
        return room.members.get(participant_id) or room.waiting.get(participant_id)

    def is_connected(self, meeting_code: str, participant_id: int) -> bool:
        return self.connection_of(meeting_code, participant_id) is not None

    def member(self, meeting_code: str, participant_id: int) -> RoomMember | None:
        """An admitted member, or None."""
        room = self._rooms.get(meeting_code)
        if room is None:
            return None
        return room.members.get(participant_id)

    def members(self, meeting_code: str) -> list[RoomMember]:
        room = self._rooms.get(meeting_code)
        if room is None:
            return []
        return list(room.members.values())

    def roster(self, meeting_code: str) -> list[RosterEntry]:
        return [member.roster_entry() for member in self.members(meeting_code)]

    def waiting_list(self, meeting_code: str) -> list[WaitingEntry]:
        room = self._rooms.get(meeting_code)
        if room is None:
            return []
        return [member.waiting_entry() for member in room.waiting.values()]

    def screen_sharer(self, meeting_code: str) -> RoomMember | None:
        for member in self.members(meeting_code):
            if member.is_screen_sharing:
                return member
        return None

    # --- room-wide state --------------------------------------------------------

    def settings(self, meeting_code: str) -> RoomSettings:
        room = self._rooms.get(meeting_code)
        if room is None:
            return DEFAULT_SETTINGS
        return room.settings

    def set_settings(self, meeting_code: str, settings: RoomSettings) -> None:
        self._room(meeting_code).settings = settings

    def is_locked(self, meeting_code: str) -> bool:
        room = self._rooms.get(meeting_code)
        return room is not None and room.is_locked

    def set_locked(self, meeting_code: str, is_locked: bool) -> None:
        self._room(meeting_code).is_locked = is_locked

    # --- sending --------------------------------------------------------------

    async def send(self, member: RoomMember, message: ServerMessage) -> None:
        """Send to one member. A browser that's already gone is skipped, not an error:
        its own connection handler notices the disconnect and cleans up."""
        try:
            await member.websocket.send_text(message.model_dump_json())
        except (WebSocketDisconnect, RuntimeError):
            pass

    async def send_to_participant(
        self, meeting_code: str, participant_id: int, message: ServerMessage
    ) -> None:
        """Send to one admitted participant by id, if they're in this room. (Messages can
        never reach another meeting's room, because we only look inside this one.)"""
        member = self.member(meeting_code, participant_id)
        if member is not None:
            await self.send(member, message)

    async def broadcast(
        self, meeting_code: str, message: ServerMessage, *, except_participant_id: int | None = None
    ) -> None:
        """Send to everyone admitted, optionally skipping one (usually the sender)."""
        # members() is a copy: a send can pause, and the room may change meanwhile.
        for member in self.members(meeting_code):
            if member.participant_id != except_participant_id:
                await self.send(member, message)

    async def send_to_moderators(self, meeting_code: str, message: ServerMessage) -> None:
        for member in self.members(meeting_code):
            if member.is_moderator:
                await self.send(member, message)

    async def close(self, member: RoomMember, code: int = CLOSE_NORMAL, reason: str = "") -> None:
        try:
            await member.websocket.close(code=code, reason=reason)
        except RuntimeError:
            pass  # already closed

    async def disconnect(
        self, meeting_code: str, member: RoomMember, code: int = CLOSE_NORMAL, reason: str = ""
    ) -> None:
        """Take a connection out of the room and hang it up, on the server's initiative.

        The departure is handled right here, so the member's own handler (which may still
        be waiting for the browser to acknowledge the close) has nothing left to do.
        """
        member.departure_handled = True
        self.remove(meeting_code, member)
        await self.close(member, code, reason)

    async def replace(self, meeting_code: str, old: RoomMember) -> None:
        """A newer connection for the same join session arrived: retire the old one."""
        await self.disconnect(
            meeting_code, old, CLOSE_REPLACED, "You joined this meeting from another tab or window"
        )

    # --- ending ---------------------------------------------------------------

    async def end_room(self, meeting_code: str) -> None:
        """Tell everyone (waiting room included) the meeting is over, and hang up."""
        # Remove the room first, so nobody gets "participant left" messages about the
        # others while everyone is being disconnected.
        room = self._rooms.pop(meeting_code, None)
        if room is None:
            return
        everyone = [*room.members.values(), *room.waiting.values()]
        for member in everyone:
            member.departure_handled = True  # the database was updated by finish_meeting
            await self.send(member, ServerMeetingEnded())
            await self.close(member)

    # --- delayed jobs -----------------------------------------------------------

    def schedule(self, job: Coroutine[Any, Any, None]) -> None:
        """Run `job` in the background (e.g. "after the grace period, record the leave")."""
        task = asyncio.create_task(job)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def _room(self, meeting_code: str) -> Room:
        return self._rooms.setdefault(meeting_code, Room())
