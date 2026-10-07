"""
Host controls: the waiting room (admit / deny), muting, asking to unmute, removing
people, co-hosts, handing over the host role, locking, and ending the meeting.

INTERVIEW: every action starts by checking the *sender's* role, held by the server
(loaded from the database when they connected, updated when it changes). The browser
hides these buttons from attendees, but that's only cosmetic: a hand-crafted message
from an attendee gets "Only the host…" back.

Who may do what (like Zoom):
    host or co-host   admit, deny, mute, ask to unmute, remove, lock, lower hands
    host only         set / remove co-hosts, make someone else host, end the meeting

Muting is cooperative in a mesh: video and audio go browser-to-browser, so the server
can't cut anyone's microphone. It tells their browser to mute, and records that it did
(docs/DECISIONS.md D-069).
"""

from app.models.enums import MeetingEventType, ParticipantRole
from app.realtime.messages import (
    ClientAdmit,
    ClientAdmitAll,
    ClientAskAllToUnmute,
    ClientAskToUnmute,
    ClientDeny,
    ClientEndMeeting,
    ClientLockMeeting,
    ClientMakeHost,
    ClientMuteAll,
    ClientMuteParticipant,
    ClientRemoveParticipant,
    ClientSetCoHost,
    ServerAskedToUnmute,
    ServerMeetingLocked,
    ServerMutedByHost,
    ServerParticipantLeft,
    ServerRemoved,
    ServerRoleChanged,
)
from app.realtime.room_context import RoomContext
from app.realtime.room_entry import enter_room, send_waiting_list
from app.realtime.room_manager import RoomMember
from app.services import room_service
from app.services.errors import ConflictError, ForbiddenError, NotFoundError

# --- waiting room -------------------------------------------------------------


async def admit(context: RoomContext, sender: RoomMember, message: ClientAdmit) -> None:
    require_moderator(sender)
    await _admit_one(context, message.participant_id)
    await send_waiting_list(context)


async def admit_all(context: RoomContext, sender: RoomMember, message: ClientAdmitAll) -> None:
    require_moderator(sender)
    for waiting in context.room_manager.waiting_list(context.meeting_code):
        await _admit_one(context, waiting.participant_id)
    await send_waiting_list(context)


async def _admit_one(context: RoomContext, participant_id: int) -> None:
    await context.in_database(room_service.admit_participant, participant_id=participant_id)
    member = context.room_manager.take_waiting(context.meeting_code, participant_id)
    if member is not None:  # still connected: bring them straight in
        await enter_room(context, member)


async def deny(context: RoomContext, sender: RoomMember, message: ClientDeny) -> None:
    require_moderator(sender)
    await context.in_database(room_service.deny_participant, participant_id=message.participant_id)
    member = context.room_manager.take_waiting(context.meeting_code, message.participant_id)
    if member is not None:
        await context.room_manager.send(member, ServerRemoved(reason="denied"))
        await context.room_manager.disconnect(context.meeting_code, member)
    await send_waiting_list(context)


# --- microphones ---------------------------------------------------------------


async def mute_participant(
    context: RoomContext, sender: RoomMember, message: ClientMuteParticipant
) -> None:
    require_moderator(sender)
    await _mute(context, _target(context, message.participant_id))


async def mute_all(context: RoomContext, sender: RoomMember, message: ClientMuteAll) -> None:
    """Everyone except hosts and co-hosts, like Zoom's "Mute all"."""
    require_moderator(sender)
    for member in context.room_manager.members(context.meeting_code):
        if member.is_mic_on and not member.is_moderator:
            await _mute(context, member)


async def _mute(context: RoomContext, target: RoomMember) -> None:
    await context.room_manager.send(target, ServerMutedByHost())
    await context.in_database(
        room_service.log_event,
        participant_id=target.participant_id,
        event_type=MeetingEventType.MUTED_BY_HOST,
    )


async def ask_to_unmute(
    context: RoomContext, sender: RoomMember, message: ClientAskToUnmute
) -> None:
    """Hosts can only *ask*: unmuting someone without consent would be a privacy problem."""
    require_moderator(sender)
    await context.room_manager.send(_target(context, message.participant_id), ServerAskedToUnmute())


async def ask_all_to_unmute(
    context: RoomContext, sender: RoomMember, message: ClientAskAllToUnmute
) -> None:
    require_moderator(sender)
    for member in context.room_manager.members(context.meeting_code):
        if not member.is_mic_on and member is not sender:
            await context.room_manager.send(member, ServerAskedToUnmute())


# --- people and roles ------------------------------------------------------------


async def remove_participant(
    context: RoomContext, sender: RoomMember, message: ClientRemoveParticipant
) -> None:
    require_moderator(sender)
    target = _target(context, message.participant_id)
    if target is sender:
        raise ConflictError("Use Leave to leave the meeting")
    if target.role == ParticipantRole.HOST:
        raise ForbiddenError("The host can't be removed")
    await context.in_database(room_service.remove_participant, participant_id=target.participant_id)
    await context.room_manager.send(target, ServerRemoved(reason="removed"))
    await context.room_manager.disconnect(context.meeting_code, target)
    await context.broadcast(ServerParticipantLeft(participant_id=target.participant_id))


async def set_co_host(context: RoomContext, sender: RoomMember, message: ClientSetCoHost) -> None:
    require_host(sender)
    target = _target(context, message.participant_id)
    if target.role == ParticipantRole.HOST:
        raise ConflictError("The host already has every permission")
    new_role = ParticipantRole.ATTENDEE
    if message.is_co_host:
        new_role = ParticipantRole.CO_HOST
    await _change_role(context, target, new_role)
    await send_waiting_list(context)  # a new co-host needs to see who's waiting


async def make_host(context: RoomContext, sender: RoomMember, message: ClientMakeHost) -> None:
    """Hand the host role to someone else (Zoom requires this before the host leaves)."""
    require_host(sender)
    target = _target(context, message.participant_id)
    if target is sender:
        return
    await _change_role(context, target, ParticipantRole.HOST)
    await _change_role(context, sender, ParticipantRole.ATTENDEE)
    await send_waiting_list(context)


async def _change_role(context: RoomContext, member: RoomMember, role: ParticipantRole) -> None:
    await context.in_database(
        room_service.set_role, participant_id=member.participant_id, role=role
    )
    member.role = role
    await context.broadcast(ServerRoleChanged(participant_id=member.participant_id, role=role))


# --- the meeting ------------------------------------------------------------------


async def lock_meeting(
    context: RoomContext, sender: RoomMember, message: ClientLockMeeting
) -> None:
    """A locked meeting refuses new joins (checked by POST /participants)."""
    require_moderator(sender)
    context.room_manager.set_locked(context.meeting_code, message.is_locked)
    await context.broadcast(ServerMeetingLocked(is_locked=message.is_locked))


async def end_meeting(context: RoomContext, sender: RoomMember, message: ClientEndMeeting) -> None:
    # The service checks the role in the database: only the host may end for everyone.
    await context.in_database(
        room_service.end_meeting_as_host,
        meeting_code=context.meeting_code,
        participant_id=sender.participant_id,
    )
    sender.has_left_on_purpose = True
    await context.room_manager.end_room(context.meeting_code)


# --- checks -------------------------------------------------------------------------


def require_moderator(member: RoomMember) -> None:
    if not member.is_moderator:
        raise ForbiddenError("Only the host or a co-host can do that")


def require_host(member: RoomMember) -> None:
    if member.role != ParticipantRole.HOST:
        raise ForbiddenError("Only the host can do that")


def _target(context: RoomContext, participant_id: int) -> RoomMember:
    target = context.room_manager.member(context.meeting_code, participant_id)
    if target is None:
        raise NotFoundError("That person is no longer in the meeting")
    return target
