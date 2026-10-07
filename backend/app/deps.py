"""
FastAPI dependencies: small functions that routes declare as parameters, and that
FastAPI calls for them before the route runs ("dependency injection").

- get_db: opens one database session per request and always closes it.
- get_bearer_token / get_optional_user / get_current_user: decide who is calling.
- get_join_ticket: a guest's proof of being in a meeting (the X-Session-Token header).
- get_session_factory: for the meeting room, which opens many short sessions.
- get_room_manager: the live rooms (who is connected to which meeting).
- get_login_attempts / get_passcode_attempts: the guessing limits.

Called by: every router, through the type aliases below (`DbSession`, `CurrentUser`, ...).
Tests replace get_db and get_session_factory with versions using a temporary database.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import HTTPConnection

from app.db import SessionLocal
from app.models import User
from app.realtime.room_manager import RoomManager
from app.services import auth_service
from app.services.attempt_limiter import AttemptLimiter
from app.services.errors import UnauthorizedError

# Reads the "Authorization: Bearer <token>" header. auto_error=False: a missing header
# gives None instead of an automatic error, because some routes also serve guests.
# (It also adds the "Authorize" button to the /docs page.)
bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Session]:
    """Yield a session for one request, and close it afterwards, even if the route raised.

    Code before `yield` runs before the route; the `finally` block runs after the
    response, which returns the connection to the pool.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]


def get_bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str | None:
    """The session token the browser sent, or None if it sent none."""
    return credentials.credentials if credentials is not None else None


BearerToken = Annotated[str | None, Depends(get_bearer_token)]


def get_optional_user(db: DbSession, token: BearerToken) -> User | None:
    """The signed-in user, or None for a guest (no token, or one that has expired).

    For the routes guests use too: looking up a meeting link, joining, the summary.
    """
    if token is None:
        return None
    return auth_service.user_for_token(db, token)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def get_current_user(user: OptionalUser) -> User:
    """The signed-in user. 401 if nobody is signed in.

    INTERVIEW: every route gets "who am I" from here, so no route reads the token
    itself. The frontend treats a 401 as "your sign-in ended": it forgets the token
    and shows the login page.
    """
    if user is None:
        raise UnauthorizedError("Please log in to continue")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_join_ticket(
    x_session_token: Annotated[str | None, Header()] = None,
) -> str | None:
    """The participant session token a guest got when joining, sent as X-Session-Token.

    Guests have no account, so this is how one proves "I'm in this meeting" to see its
    details and summary (meeting_service.get_meeting_for_viewer).
    """
    return x_session_token


JoinTicket = Annotated[str | None, Depends(get_join_ticket)]


def get_session_factory() -> sessionmaker[Session]:
    """The session factory itself, instead of one session.

    A meeting room's WebSocket can stay open for an hour. Holding one session (and its
    transaction) that long would be wasteful, so the room opens a short session for
    each piece of database work instead.
    """
    return SessionLocal


SessionFactory = Annotated[sessionmaker[Session], Depends(get_session_factory)]


def get_room_manager(connection: HTTPConnection) -> RoomManager:
    """The app's one RoomManager, created in main.py.

    `HTTPConnection` is the shared parent of HTTP requests and WebSockets, so the same
    dependency works for the room's WebSocket and for REST routes (e.g. ending a meeting).
    """
    room_manager: RoomManager = connection.app.state.room_manager
    return room_manager


LiveRooms = Annotated[RoomManager, Depends(get_room_manager)]


def get_login_attempts(connection: HTTPConnection) -> AttemptLimiter:
    """Failed logins per account (created in main.py)."""
    limiter: AttemptLimiter = connection.app.state.login_attempts
    return limiter


def get_passcode_attempts(connection: HTTPConnection) -> AttemptLimiter:
    """Wrong passcodes per meeting (created in main.py)."""
    limiter: AttemptLimiter = connection.app.state.passcode_attempts
    return limiter


LoginAttempts = Annotated[AttemptLimiter, Depends(get_login_attempts)]
PasscodeAttempts = Annotated[AttemptLimiter, Depends(get_passcode_attempts)]
