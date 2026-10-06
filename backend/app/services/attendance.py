"""
Helpers for turning participant rows (one per join session) into people.

Called by: schemas/meeting.py (attendee counts in lists) and summary_service.py.
"""

from app.models import Participant


def person_key(participant: Participant) -> str:
    """A key that's the same for every join session of one person.

    Account holders are matched by user id. Guests have no account, so their display
    name is the best we have (two guests with the same name will be merged).
    """
    if participant.user_id is not None:
        return f"user:{participant.user_id}"
    return f"guest:{participant.display_name}"


def count_distinct_attendees(participants: list[Participant]) -> int:
    """How many different people joined, not how many join sessions there were."""
    return len({person_key(participant) for participant in participants})
