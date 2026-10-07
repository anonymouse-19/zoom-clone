"""
The messages that cross a meeting room's WebSocket, in both directions.

Every message is one JSON object with a "type" field naming what it is. Both sides
(this file and frontend/lib/roomProtocol.ts) spell the same shapes, so read them
together. Each message's fields sit next to "type" (no nested "payload"), so Pydantic
validates every field by name (docs/DECISIONS.md D-065).

Called by: room_handler.py and the handler modules (parse what browsers send, build
what they receive), and room_manager.py (sends them).

Browser → server ("Client..." classes)
    signal               pass a WebRTC setup message to one other participant
    media_state          my mic / camera is now on / off
    chat_message         to everyone, or privately to one participant
    reaction             a floating emoji (not saved)
    raise_hand / lower_hand
    start_screen_share / stop_screen_share
    leave
    host controls        admit, admit_all, deny, mute_participant, mute_all,
                         ask_to_unmute, ask_all_to_unmute, remove_participant,
                         set_co_host, make_host, lock_meeting, end_meeting

Server → browser ("Server..." classes)
    welcome              you're in: everyone present, chat so far, settings
    waiting              you're in the waiting room
    participant_joined / participant_left
    media_state          someone's mic / camera / screen share changed
    hand_changed         someone raised or lowered their hand
    signal               a WebRTC setup message from another participant
    chat_message, reaction
    waiting_room         (to hosts) who is waiting to be let in
    muted_by_host, asked_to_unmute, removed
    role_changed, meeting_locked, meeting_ended
    error                something you sent was refused
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints, TypeAdapter

from app.models.enums import ParticipantRole, ScreenSharePermission
from app.schemas.chat import ChatMessageOut

# WebSocket close codes. 1000 means "closed normally". Codes 4000–4999 are free for an
# application to define, so these tell the frontend *why* it was disconnected.
CLOSE_NORMAL = 1000
CLOSE_REFUSED = 4403  # wrong token, not admitted, meeting not live, ... (see `reason`)
CLOSE_REPLACED = 4409  # the same join session connected again (another tab); this one is closed

CHAT_MAX_LENGTH = 2000

# Zoom's quick reactions. Anything else is refused, so nobody can float arbitrary text.
ReactionEmoji = Literal["👏", "👍", "❤️", "😂", "😮", "🎉"]

ChatText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=CHAT_MAX_LENGTH)
]


class RosterEntry(BaseModel):
    """One person currently in the room, as every other participant sees them."""

    participant_id: int
    display_name: str
    role: ParticipantRole
    is_mic_on: bool
    is_camera_on: bool
    is_screen_sharing: bool
    # When they raised their hand (None = hand down). The time orders the hand queue.
    hand_raised_at: datetime | None


class WaitingEntry(BaseModel):
    """Someone in the waiting room, as hosts see them."""

    participant_id: int
    display_name: str


class RoomSettings(BaseModel):
    """The meeting settings the room needs while it's running."""

    mute_on_entry: bool
    chat_enabled: bool
    screen_share: ScreenSharePermission


# ---------------------------------------------------------------------------
# Browser → server
# ---------------------------------------------------------------------------


class ClientSignal(BaseModel):
    """A WebRTC setup message (an SDP offer/answer or an ICE candidate) for one peer.

    `data` is opaque to the server: it only forwards it. Only the two browsers understand it.
    """

    type: Literal["signal"]
    to_participant_id: int
    data: dict[str, Any]


class ClientMediaState(BaseModel):
    type: Literal["media_state"]
    is_mic_on: bool
    is_camera_on: bool


class ClientChatMessage(BaseModel):
    type: Literal["chat_message"]
    text: ChatText
    # None = to everyone; an id = a private message to that participant.
    to_participant_id: int | None = None


class ClientReaction(BaseModel):
    type: Literal["reaction"]
    emoji: ReactionEmoji


class ClientRaiseHand(BaseModel):
    type: Literal["raise_hand"]


class ClientLowerHand(BaseModel):
    type: Literal["lower_hand"]
    # None = my own hand. Someone else's id = a host lowering their hand.
    participant_id: int | None = None


class ClientStartScreenShare(BaseModel):
    type: Literal["start_screen_share"]


class ClientStopScreenShare(BaseModel):
    type: Literal["stop_screen_share"]


class ClientLeave(BaseModel):
    type: Literal["leave"]


# --- host controls (the server checks the sender's role for every one) ---


class ClientAdmit(BaseModel):
    type: Literal["admit"]
    participant_id: int


class ClientAdmitAll(BaseModel):
    type: Literal["admit_all"]


class ClientDeny(BaseModel):
    type: Literal["deny"]
    participant_id: int


class ClientMuteParticipant(BaseModel):
    type: Literal["mute_participant"]
    participant_id: int


class ClientMuteAll(BaseModel):
    type: Literal["mute_all"]


class ClientAskToUnmute(BaseModel):
    type: Literal["ask_to_unmute"]
    participant_id: int


class ClientAskAllToUnmute(BaseModel):
    type: Literal["ask_all_to_unmute"]


class ClientRemoveParticipant(BaseModel):
    type: Literal["remove_participant"]
    participant_id: int


class ClientSetCoHost(BaseModel):
    type: Literal["set_co_host"]
    participant_id: int
    is_co_host: bool


class ClientMakeHost(BaseModel):
    type: Literal["make_host"]
    participant_id: int


class ClientLockMeeting(BaseModel):
    type: Literal["lock_meeting"]
    is_locked: bool


class ClientEndMeeting(BaseModel):
    type: Literal["end_meeting"]


# `discriminator="type"` tells Pydantic to look at the "type" field first and validate
# against the one class that matches, instead of trying every class in turn.
ClientMessage = Annotated[
    ClientSignal
    | ClientMediaState
    | ClientChatMessage
    | ClientReaction
    | ClientRaiseHand
    | ClientLowerHand
    | ClientStartScreenShare
    | ClientStopScreenShare
    | ClientLeave
    | ClientAdmit
    | ClientAdmitAll
    | ClientDeny
    | ClientMuteParticipant
    | ClientMuteAll
    | ClientAskToUnmute
    | ClientAskAllToUnmute
    | ClientRemoveParticipant
    | ClientSetCoHost
    | ClientMakeHost
    | ClientLockMeeting
    | ClientEndMeeting,
    Field(discriminator="type"),
]
CLIENT_MESSAGE_PARSER: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)


# ---------------------------------------------------------------------------
# Server → browser
# ---------------------------------------------------------------------------


class ServerWelcome(BaseModel):
    type: Literal["welcome"] = "welcome"
    your_participant_id: int
    # Everyone in the room right now, including you.
    participants: list[RosterEntry]
    # Only filled in for hosts and co-hosts.
    waiting: list[WaitingEntry]
    # Chat so far: everything to everyone, plus private messages to or from you.
    chat_history: list[ChatMessageOut]
    settings: RoomSettings
    is_locked: bool


class ServerWaiting(BaseModel):
    """You're in the waiting room; you'll get a "welcome" when the host lets you in."""

    type: Literal["waiting"] = "waiting"


class ServerParticipantJoined(BaseModel):
    type: Literal["participant_joined"] = "participant_joined"
    participant: RosterEntry


class ServerParticipantLeft(BaseModel):
    type: Literal["participant_left"] = "participant_left"
    participant_id: int


class ServerMediaState(BaseModel):
    type: Literal["media_state"] = "media_state"
    participant_id: int
    is_mic_on: bool
    is_camera_on: bool
    is_screen_sharing: bool


class ServerHandChanged(BaseModel):
    type: Literal["hand_changed"] = "hand_changed"
    participant_id: int
    hand_raised_at: datetime | None


class ServerSignal(BaseModel):
    type: Literal["signal"] = "signal"
    from_participant_id: int
    data: dict[str, Any]


class ServerChatMessage(BaseModel):
    type: Literal["chat_message"] = "chat_message"
    message: ChatMessageOut


class ServerReaction(BaseModel):
    type: Literal["reaction"] = "reaction"
    participant_id: int
    emoji: ReactionEmoji


class ServerWaitingRoom(BaseModel):
    """To hosts and co-hosts: the full current waiting list (simpler than diffs)."""

    type: Literal["waiting_room"] = "waiting_room"
    participants: list[WaitingEntry]


class ServerMutedByHost(BaseModel):
    type: Literal["muted_by_host"] = "muted_by_host"


class ServerAskedToUnmute(BaseModel):
    type: Literal["asked_to_unmute"] = "asked_to_unmute"


class ServerRemoved(BaseModel):
    type: Literal["removed"] = "removed"
    # "removed": taken out of the meeting. "denied": not let in from the waiting room.
    reason: Literal["removed", "denied"]


class ServerRoleChanged(BaseModel):
    type: Literal["role_changed"] = "role_changed"
    participant_id: int
    role: ParticipantRole


class ServerMeetingLocked(BaseModel):
    type: Literal["meeting_locked"] = "meeting_locked"
    is_locked: bool


class ServerMeetingEnded(BaseModel):
    type: Literal["meeting_ended"] = "meeting_ended"


class ServerError(BaseModel):
    type: Literal["error"] = "error"
    message: str


ServerMessage = (
    ServerWelcome
    | ServerWaiting
    | ServerParticipantJoined
    | ServerParticipantLeft
    | ServerMediaState
    | ServerHandChanged
    | ServerSignal
    | ServerChatMessage
    | ServerReaction
    | ServerWaitingRoom
    | ServerMutedByHost
    | ServerAskedToUnmute
    | ServerRemoved
    | ServerRoleChanged
    | ServerMeetingLocked
    | ServerMeetingEnded
    | ServerError
)
