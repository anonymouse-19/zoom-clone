"""
The demo data itself, as plain, readable specs: who exists, which meetings are coming
up, and who attended past meetings (with join/leave minutes and chat lines).

Used by: seed.py, which turns these specs into database rows. Keeping the data apart
from the insert logic means you can change the demo without reading any SQLAlchemy.

People are referred to by the name constants below (ALEX, PRIYA, ...). A typo in a
constant is a Python error, while a typo in a plain string would silently create a stranger.
"""

from dataclasses import dataclass
from datetime import time

# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

ALEX = "Alex Morgan"  # the default, "logged in" user (id=1)
PRIYA = "Priya Sharma"
DANIEL = "Daniel Kim"
SOFIA = "Sofia Rossi"


@dataclass(frozen=True)
class SeedUser:
    name: str
    email: str
    avatar_color: str
    timezone: str


# Order matters: users get ids 1, 2, 3, 4 in this order, so ALEX must stay first.
SEED_USERS = [
    SeedUser(
        name=ALEX,
        email="alex.morgan@example.com",
        avatar_color="#0B5CFF",
        timezone="Asia/Kolkata",
    ),
    SeedUser(
        name=PRIYA,
        email="priya.sharma@example.com",
        avatar_color="#7C3AED",
        timezone="Asia/Kolkata",
    ),
    SeedUser(
        name=DANIEL,
        email="daniel.kim@example.com",
        avatar_color="#059669",
        timezone="America/Los_Angeles",
    ),
    SeedUser(
        name=SOFIA,
        email="sofia.rossi@example.com",
        avatar_color="#DB2777",
        timezone="Europe/Rome",
    ),
]

# ---------------------------------------------------------------------------
# Upcoming meetings (times are wall-clock times in the default user's timezone)
# ---------------------------------------------------------------------------

STANDUP_DESCRIPTION = "Yesterday / today / blockers. Keep it under 15 minutes."


@dataclass(frozen=True)
class UpcomingSpec:
    title: str
    days_from_today: int  # 1 = tomorrow
    start: time
    duration_minutes: int
    host: str
    invitees: list[str]
    description: str = ""
    allow_join_before_host: bool = False


UPCOMING_MEETINGS = [
    UpcomingSpec(
        title="Daily Standup",
        days_from_today=1,
        start=time(9, 30),
        duration_minutes=15,
        host=ALEX,
        invitees=[PRIYA, DANIEL, SOFIA],
        description=STANDUP_DESCRIPTION,
        allow_join_before_host=True,
    ),
    UpcomingSpec(
        title="Daily Standup",
        days_from_today=2,
        start=time(9, 30),
        duration_minutes=15,
        host=ALEX,
        invitees=[PRIYA, DANIEL, SOFIA],
        description=STANDUP_DESCRIPTION,
        allow_join_before_host=True,
    ),
    UpcomingSpec(
        title="Daily Standup",
        days_from_today=3,
        start=time(9, 30),
        duration_minutes=15,
        host=ALEX,
        invitees=[PRIYA, DANIEL, SOFIA],
        description=STANDUP_DESCRIPTION,
        allow_join_before_host=True,
    ),
    UpcomingSpec(
        title="1:1 Priya / Alex",
        days_from_today=2,
        start=time(15, 0),
        duration_minutes=30,
        host=ALEX,
        invitees=[PRIYA],
    ),
    UpcomingSpec(
        title="Sprint Planning",
        days_from_today=4,
        start=time(11, 0),
        duration_minutes=90,
        host=DANIEL,
        invitees=[ALEX, PRIYA, SOFIA],
        description="Pick sprint 43 scope. Bring estimates for your tickets.",
    ),
    UpcomingSpec(
        title="Customer Demo: Acme Corp",
        days_from_today=6,
        start=time(17, 0),
        duration_minutes=45,
        host=ALEX,
        invitees=[SOFIA],
        description="Walkthrough of scheduling + join flow for Acme's IT team.",
    ),
]

# ---------------------------------------------------------------------------
# Past meetings
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Attendance:
    """One join session: who, and when they joined/left (minutes after the start).

    `is_guest=True` means the person has no account (no `users` row), like someone
    who joined from an invite link.
    """

    person: str
    joined_minute: int
    left_minute: int
    is_guest: bool = False


@dataclass(frozen=True)
class ChatLine:
    """A chat message sent `minute` minutes after the start.
    `private_to=None` means it was sent to everyone."""

    sender: str
    minute: int
    body: str
    private_to: str | None = None


@dataclass(frozen=True)
class PastSpec:
    title: str
    days_ago: int
    start: time
    planned_minutes: int
    host: str
    attendance: list[Attendance]
    chat: list[ChatLine]


PAST_MEETINGS = [
    PastSpec(
        title="Daily Standup",
        days_ago=1,
        start=time(9, 30),
        planned_minutes=15,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=16),
            Attendance(PRIYA, joined_minute=0, left_minute=15),
            Attendance(DANIEL, joined_minute=2, left_minute=16),
            Attendance(SOFIA, joined_minute=1, left_minute=14),
        ],
        chat=[ChatLine(DANIEL, minute=2, body="Sorry, mic issues, joining in a sec")],
    ),
    PastSpec(
        title="Daily Standup",
        days_ago=2,
        start=time(9, 30),
        planned_minutes=15,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=14),
            Attendance(PRIYA, joined_minute=0, left_minute=14),
            Attendance(SOFIA, joined_minute=0, left_minute=13),
        ],
        chat=[],
    ),
    # Daniel drops and rejoins: two participant rows (join sessions) for one person.
    PastSpec(
        title="Product Roadmap Q4",
        days_ago=2,
        start=time(14, 0),
        planned_minutes=60,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=62),
            Attendance(PRIYA, joined_minute=0, left_minute=62),
            Attendance(DANIEL, joined_minute=5, left_minute=40),
            Attendance(DANIEL, joined_minute=43, left_minute=62),
            Attendance(SOFIA, joined_minute=3, left_minute=60),
        ],
        chat=[
            ChatLine(PRIYA, minute=2, body="Deck is in the shared drive under Roadmap/Q4"),
            ChatLine(DANIEL, minute=44, body="Dropped for a minute, back now"),
            ChatLine(SOFIA, minute=50, body="Can we cover pricing at the end?", private_to=ALEX),
            ChatLine(ALEX, minute=51, body="Yes, adding it now", private_to=SOFIA),
        ],
    ),
    PastSpec(
        title="Interview: Frontend Engineer",
        days_ago=3,
        start=time(16, 0),
        planned_minutes=45,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=47),
            Attendance(PRIYA, joined_minute=0, left_minute=47),
            Attendance("Jordan Lee", joined_minute=1, left_minute=46, is_guest=True),
        ],
        chat=[],
    ),
    PastSpec(
        title="Weekly Team Sync",
        days_ago=4,
        start=time(11, 0),
        planned_minutes=30,
        host=DANIEL,
        attendance=[
            Attendance(DANIEL, joined_minute=0, left_minute=33),
            Attendance(ALEX, joined_minute=1, left_minute=33),
            Attendance(PRIYA, joined_minute=0, left_minute=30),
            Attendance(SOFIA, joined_minute=2, left_minute=33),
        ],
        chat=[ChatLine(DANIEL, minute=5, body="Reminder: retro notes are due Friday")],
    ),
    PastSpec(
        title="Bug Bash: Join Flow",
        days_ago=5,
        start=time(15, 0),
        planned_minutes=60,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=55),
            Attendance(DANIEL, joined_minute=0, left_minute=55),
            Attendance(SOFIA, joined_minute=10, left_minute=50),
        ],
        chat=[
            ChatLine(DANIEL, minute=12, body="Pasting a URL with ?pwd= breaks the ID field"),
            ChatLine(ALEX, minute=13, body="Good catch, filing it"),
        ],
    ),
    PastSpec(
        title="Design Sync",
        days_ago=6,
        start=time(12, 0),
        planned_minutes=30,
        host=SOFIA,
        attendance=[
            Attendance(SOFIA, joined_minute=0, left_minute=28),
            Attendance(ALEX, joined_minute=0, left_minute=28),
        ],
        chat=[],
    ),
    PastSpec(
        title="Retro: Sprint 41",
        days_ago=8,
        start=time(17, 0),
        planned_minutes=45,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=44),
            Attendance(PRIYA, joined_minute=0, left_minute=44),
            Attendance(DANIEL, joined_minute=1, left_minute=44),
            Attendance(SOFIA, joined_minute=0, left_minute=41),
        ],
        chat=[],
    ),
    PastSpec(
        title="Marketing Launch Prep",
        days_ago=10,
        start=time(13, 0),
        planned_minutes=30,
        host=PRIYA,
        attendance=[
            Attendance(PRIYA, joined_minute=0, left_minute=25),
            Attendance(ALEX, joined_minute=2, left_minute=25),
            Attendance("Sam (Agency)", joined_minute=3, left_minute=20, is_guest=True),
        ],
        chat=[],
    ),
    PastSpec(
        title="1:1 Daniel / Alex",
        days_ago=12,
        start=time(10, 0),
        planned_minutes=30,
        host=ALEX,
        attendance=[
            Attendance(ALEX, joined_minute=0, left_minute=24),
            Attendance(DANIEL, joined_minute=0, left_minute=24),
        ],
        chat=[],
    ),
]
