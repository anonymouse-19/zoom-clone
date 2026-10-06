"""
Every fixed set of values the database stores (meeting type, status, roles, ...).

Called by: the model files (column types), the seed script, and from Phase 2 the
services and Pydantic schemas. Defining each set once means the DB CHECK constraint,
the API validation and the business logic can never disagree about the allowed values.

`StrEnum` members *are* strings: MeetingStatus.LIVE == "live" is True, so they
serialize to JSON and compare against plain strings without conversion.
"""

from enum import StrEnum


class MeetingType(StrEnum):
    """How the meeting was created."""

    INSTANT = "instant"  # "New meeting" button: starts immediately
    SCHEDULED = "scheduled"  # created via the Schedule form for a future time
    PERSONAL = "personal"  # the user's reusable Personal Meeting Room (PMI)


class MeetingStatus(StrEnum):
    """Lifecycle: scheduled → live → ended, or scheduled → cancelled."""

    SCHEDULED = "scheduled"
    LIVE = "live"
    ENDED = "ended"
    CANCELLED = "cancelled"


class ParticipantRole(StrEnum):
    HOST = "host"
    CO_HOST = "co_host"
    ATTENDEE = "attendee"


class ParticipantStatus(StrEnum):
    """Where one join session currently stands."""

    WAITING = "waiting"  # in the waiting room, not yet admitted
    ADMITTED = "admitted"  # in the meeting
    LEFT = "left"  # left on their own
    REMOVED = "removed"  # removed (or denied entry) by the host


class Recurrence(StrEnum):
    """How often a scheduled meeting repeats. Stored as a label: we don't generate the
    individual future occurrences (see docs/DECISIONS.md D-047)."""

    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"


class JoinAs(StrEnum):
    """Which "door" a join request came through (see docs/DECISIONS.md D-045)."""

    HOST = "host"  # the dashboard's Start / New meeting: requires being the host
    GUEST = "guest"  # the Join page or an invite link: joins as an attendee


class ScreenSharePermission(StrEnum):
    HOST_ONLY = "host_only"
    ALL = "all"


class MeetingEventType(StrEnum):
    """Audit-log event names.

    Unlike the enums above, this set is stored as a plain string column with no CHECK
    constraint. It's an open-ended list that will grow, and adding an event type
    shouldn't require a database migration. Python still validates it through this enum.
    """

    MEETING_STARTED = "meeting_started"
    MEETING_ENDED = "meeting_ended"
    JOINED = "joined"
    LEFT = "left"
    ADMITTED = "admitted"
    REMOVED = "removed"
    MUTED_BY_HOST = "muted_by_host"
    ROLE_CHANGED = "role_changed"
    HAND_RAISED = "hand_raised"
    SCREEN_SHARE_STARTED = "screen_share_started"
    SCREEN_SHARE_STOPPED = "screen_share_stopped"
    RECORDING_STARTED = "recording_started"
