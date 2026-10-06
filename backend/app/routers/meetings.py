"""
Meeting routes under /api/meetings.

Each route does three things only: receive validated input (FastAPI + Pydantic), call a
service function, and convert the result into a response schema. Business rules live in
services/. Service errors become 403/404/409/503 in main.py's error handler.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.deps import CurrentUser, DbSession
from app.models.types import utc_now
from app.routers.params import MeetingCode
from app.schemas.chat import ChatMessageOut
from app.schemas.errors import CONFLICT, FORBIDDEN, NOT_FOUND, UNAVAILABLE
from app.schemas.join import ResolveResponse
from app.schemas.meeting import (
    InstantMeetingRequest,
    MeetingDetail,
    MeetingListItem,
    ScheduleMeetingRequest,
    UpdateMeetingRequest,
)
from app.schemas.summary import MeetingSummaryOut
from app.services import join_service, meeting_service, summary_service
from app.services.ics import build_ics
from app.services.meeting_service import MeetingScope

router = APIRouter(prefix="/meetings", tags=["meetings"])

MAX_RESOLVE_INPUT_LENGTH = 500


@router.get("", response_model=list[MeetingListItem])
def list_meetings(
    db: DbSession, user: CurrentUser, scope: MeetingScope = MeetingScope.UPCOMING
) -> list[MeetingListItem]:
    """Upcoming (default), recent, or all meetings the current user is involved in."""
    meetings = meeting_service.list_meetings(db, user, scope)
    return [MeetingListItem.from_meeting(meeting) for meeting in meetings]


@router.post(
    "/instant",
    response_model=MeetingDetail,
    status_code=status.HTTP_201_CREATED,
    responses={**UNAVAILABLE},
)
def create_instant_meeting(
    db: DbSession, user: CurrentUser, request: InstantMeetingRequest | None = None
) -> MeetingDetail:
    """Start a meeting right now (the "New meeting" button). The body is optional."""
    meeting = meeting_service.create_instant_meeting(db, user, request or InstantMeetingRequest())
    return MeetingDetail.from_meeting(meeting)


@router.post(
    "",
    response_model=MeetingDetail,
    status_code=status.HTTP_201_CREATED,
    responses={**UNAVAILABLE},
)
def schedule_meeting(
    db: DbSession, user: CurrentUser, request: ScheduleMeetingRequest
) -> MeetingDetail:
    meeting = meeting_service.schedule_meeting(db, user, request)
    return MeetingDetail.from_meeting(meeting)


# INTERVIEW: route order matters. FastAPI tries routes in the order they're declared,
# so /resolve must come before /{meeting_code}, or "resolve" would be read as a code.
@router.get("/resolve", response_model=ResolveResponse)
def resolve_join_input(
    db: DbSession,
    user: CurrentUser,
    q: Annotated[str, Query(min_length=1, max_length=MAX_RESOLVE_INPUT_LENGTH)],
) -> ResolveResponse:
    """Accepts an ID ("123 4567 8901") or any invite link, and says whether it's joinable.

    Always 200: "not found" or "ended" are normal answers here, not errors.
    """
    check = join_service.resolve_join_input(db, q, user)
    return ResolveResponse.from_check(check)


@router.get("/{meeting_code}", response_model=MeetingDetail, responses={**NOT_FOUND})
def get_meeting(db: DbSession, meeting_code: MeetingCode) -> MeetingDetail:
    meeting = meeting_service.get_meeting_by_code(db, meeting_code)
    return MeetingDetail.from_meeting(meeting)


@router.patch(
    "/{meeting_code}",
    response_model=MeetingDetail,
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT},
)
def update_meeting(
    db: DbSession, user: CurrentUser, meeting_code: MeetingCode, request: UpdateMeetingRequest
) -> MeetingDetail:
    meeting = meeting_service.update_meeting(db, meeting_code, user, request)
    return MeetingDetail.from_meeting(meeting)


@router.delete(
    "/{meeting_code}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT},
)
def cancel_meeting(db: DbSession, user: CurrentUser, meeting_code: MeetingCode) -> None:
    """Cancel (soft delete). 204 = success with nothing to send back."""
    meeting_service.cancel_meeting(db, meeting_code, user)


@router.post(
    "/{meeting_code}/start",
    response_model=MeetingDetail,
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT},
)
def start_meeting(db: DbSession, user: CurrentUser, meeting_code: MeetingCode) -> MeetingDetail:
    meeting = meeting_service.start_meeting(db, meeting_code, user)
    return MeetingDetail.from_meeting(meeting)


@router.post(
    "/{meeting_code}/end",
    response_model=MeetingDetail,
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT},
)
def end_meeting(db: DbSession, user: CurrentUser, meeting_code: MeetingCode) -> MeetingDetail:
    meeting = meeting_service.end_meeting(db, meeting_code, user)
    return MeetingDetail.from_meeting(meeting)


@router.get(
    "/{meeting_code}/ics",
    response_class=Response,
    responses={**NOT_FOUND, **CONFLICT},
)
def download_calendar_file(db: DbSession, meeting_code: MeetingCode) -> Response:
    """The meeting as an .ics file. Content-Disposition makes the browser download it."""
    meeting = meeting_service.get_meeting_by_code(db, meeting_code)
    return Response(
        content=build_ics(meeting, now=utc_now()),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="meeting-{meeting_code}.ics"'},
    )


@router.get(
    "/{meeting_code}/summary",
    response_model=MeetingSummaryOut,
    responses={**NOT_FOUND, **CONFLICT},
)
def get_meeting_summary(
    db: DbSession, user: CurrentUser, meeting_code: MeetingCode
) -> MeetingSummaryOut:
    return summary_service.build_meeting_summary(db, meeting_code, user)


@router.get(
    "/{meeting_code}/messages",
    response_model=list[ChatMessageOut],
    responses={**NOT_FOUND},
)
def get_chat_history(db: DbSession, meeting_code: MeetingCode) -> list[ChatMessageOut]:
    """Messages sent to everyone in the current/latest run of the meeting."""
    return summary_service.list_public_messages(db, meeting_code)
